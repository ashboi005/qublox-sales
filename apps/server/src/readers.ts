import { z } from "zod";
import { and, count, eq, gte } from "drizzle-orm";
import type { Database } from "@qublox-sales/db";
import { apiUsage } from "@qublox-sales/db/schema/sales";
import type { SalesConfig } from "./config";
import { resolvePublicTarget } from "./safe-fetch";

// Fallback page readers for sites our own fetch cannot read (bot protection, pages built
// entirely in JavaScript, odd TLS or encodings). Both render the page in a real browser.
//   1. Jina Reader: free without a key (20 requests a minute), nothing to bill.
//   2. Firecrawl: free plan, 1,000 pages a month, no card. Capped locally below that.
// Only public website URLs are sent; robots.txt has already been checked by the caller.

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
export type ReadPage = { url: string; body: string; via: "jina" | "firecrawl" };
export type PageReader = (url: string) => Promise<ReadPage>;
type Service = "reoon" | "jina" | "firecrawl" | "pagespeed";

export function monthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
// Local ledger for free-tier services, so the app stops before a provider would charge.
export function apiLedger(db: Database) {
  return {
    async used(service: Service) {
      const [row] = await db
        .select({ value: count() })
        .from(apiUsage)
        .where(and(eq(apiUsage.service, service), gte(apiUsage.createdAt, monthStart())));
      return row?.value || 0;
    },
    async record(service: Service, ok: boolean) {
      await db.insert(apiUsage).values({ id: crypto.randomUUID(), service, ok: ok ? 1 : 0 });
    },
  };
}

const jinaSchema = z.object({
  data: z.object({
    html: z.string().optional(),
    finalUrl: z.string().optional(),
    url: z.string().optional(),
  }),
});
const firecrawlSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      html: z.string().optional(),
      rawHtml: z.string().optional(),
      metadata: z
        .object({
          url: z.string().optional(),
          sourceURL: z.string().optional(),
          statusCode: z.number().optional(),
        })
        .passthrough()
        .optional(),
    })
    .optional(),
});

const MAX_HTML = 3_000_000;
const usable = (html: string | undefined) =>
  html && html.length > 200 ? html.slice(0, MAX_HTML) : "";

export function pageReader(
  db: Database,
  config: SalesConfig,
  fetcher: Fetcher = fetch,
): PageReader | null {
  if (!config.PAGE_READER_FALLBACK) return null;
  const ledger = apiLedger(db);
  const jina = async (url: string): Promise<ReadPage | null> => {
    const response = await fetcher(`https://r.jina.ai/${url}`, {
      signal: AbortSignal.timeout(45_000),
      headers: {
        Accept: "application/json",
        "X-Return-Format": "html",
        ...(config.JINA_API_KEY ? { Authorization: `Bearer ${config.JINA_API_KEY}` } : {}),
      },
    }).catch(() => null);
    const ok = Boolean(response?.ok);
    await ledger.record("jina", ok);
    if (!response || !ok) {
      await response?.body?.cancel().catch(() => {});
      return null;
    }
    const parsed = jinaSchema.safeParse(await response.json().catch(() => null));
    const body = usable(parsed.data?.data.html);
    return body
      ? { url: parsed.data!.data.finalUrl || parsed.data!.data.url || url, body, via: "jina" }
      : null;
  };
  const firecrawl = async (url: string): Promise<ReadPage | null> => {
    if (!config.FIRECRAWL_API_KEY) return null;
    if ((await ledger.used("firecrawl")) >= config.FIRECRAWL_MONTHLY_LIMIT) return null;
    const response = await fetcher("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      signal: AbortSignal.timeout(60_000),
      headers: {
        Authorization: `Bearer ${config.FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      // Contact details usually live in the header and footer, so keep the whole page.
      body: JSON.stringify({ url, formats: ["html"], onlyMainContent: false, timeout: 45_000 }),
    }).catch(() => null);
    const ok = Boolean(response?.ok);
    await ledger.record("firecrawl", ok);
    if (!response || !ok) {
      await response?.body?.cancel().catch(() => {});
      return null;
    }
    const parsed = firecrawlSchema.safeParse(await response.json().catch(() => null));
    const data = parsed.success && parsed.data.success ? parsed.data.data : undefined;
    const status = data?.metadata?.statusCode;
    const body = status && status >= 400 ? "" : usable(data?.html || data?.rawHtml);
    return body
      ? { url: data?.metadata?.url || data?.metadata?.sourceURL || url, body, via: "firecrawl" }
      : null;
  };
  return async (url: string) => {
    // Same public-address rule as our own fetch: never hand a private address to a reader.
    await resolvePublicTarget(url);
    const page = (await jina(url)) || (await firecrawl(url));
    if (!page)
      throw new Error(
        "No usable page text found, even with a full browser. Add evidence manually.",
      );
    return page;
  };
}
