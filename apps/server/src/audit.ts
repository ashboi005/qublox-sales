import { load } from "cheerio";
import { z } from "zod";
import type { Audit, Evidence } from "@qublox-sales/shared";

// Website audit: cheap on-page checks plus Google PageSpeed Insights (free API) for a
// measured mobile speed. The result becomes "audit" evidence the AI can cite, and feeds
// the opportunity score that orders the work queue.

export function pageSignals(html: string, url: string, now = new Date()): Audit {
  const $ = load(html);
  const lower = html.toLowerCase();
  const years = [
    ...$("body")
      .text()
      .matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d{2})/gi),
  ]
    .map((m) => Number(m[1]))
    .filter((y) => y > 1995 && y <= now.getUTCFullYear());
  const hrefs = $("a[href]")
    .map((_, el) => ($(el).attr("href") || "").toLowerCase())
    .get();
  const linkText = $("a, button")
    .map((_, el) => $(el).text().toLowerCase())
    .get()
    .join(" ");
  return {
    https: new URL(url).protocol === "https:",
    mobileViewport: $("meta[name='viewport']").length > 0,
    ...(years.length ? { copyrightYear: Math.max(...years) } : {}),
    booking:
      /calendly\.com|setmore|simplybook|fresha|booksy|zoho\.com\/bookings|practo|opentable|dineout|zomato\.com\/.*book/.test(
        lower,
      ) ||
      hrefs.some((h) => /book|appointment|reserv|schedule/.test(h)) ||
      /\b(book (now|online|an appointment|a table)|make a reservation|schedule (a|an) )/.test(
        linkText,
      ),
    store:
      /cdn\.shopify\.com|woocommerce|add[-_ ]to[-_ ]cart|data-product-id/.test(lower) ||
      hrefs.some((h) => /\/(cart|checkout|shop|products?)\b/.test(h)),
    whatsapp: hrefs.some((h) => /wa\.me\/|whatsapp\.com\/send|api\.whatsapp\.com/.test(h)),
    contactForm:
      $("form").filter((_, f) => $(f).find("textarea, input[type='email']").length > 0).length > 0,
  };
}

const pageSpeedSchema = z.object({
  lighthouseResult: z.object({
    categories: z.object({ performance: z.object({ score: z.number().nullable() }) }),
    audits: z.record(z.string(), z.object({ numericValue: z.number().optional() }).passthrough()),
  }),
});

// Google PageSpeed Insights v5, mobile, performance only. Free; needs a key because the
// keyless quota is shared and usually exhausted. Returns null on any failure.
export async function pageSpeed(
  url: string,
  key: string,
  fetcher: (url: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<Pick<Audit, "performance" | "largestPaintSeconds"> | null> {
  if (!key) return null;
  const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  endpoint.search = new URLSearchParams({
    url,
    strategy: "mobile",
    category: "performance",
    key,
  }).toString();
  try {
    const response = await fetcher(endpoint.toString(), { signal: AbortSignal.timeout(90_000) });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return null;
    }
    const result = pageSpeedSchema.parse(await response.json()).lighthouseResult;
    const score = result.categories.performance.score;
    const lcp = result.audits["largest-contentful-paint"]?.numericValue;
    return {
      ...(score === null ? {} : { performance: Math.round(score * 100) }),
      ...(lcp === undefined ? {} : { largestPaintSeconds: Math.round(lcp / 100) / 10 }),
    };
  } catch {
    return null;
  }
}

// Plain sentences, so the AI can quote one real observation.
export function auditEvidence(audit: Audit, url: string, now = new Date()): Evidence | null {
  const facts: string[] = [];
  if (audit.performance !== undefined) {
    // Only call speed a problem when it is one; a fast site is stated as fast.
    const slow = audit.performance < 70 || (audit.largestPaintSeconds ?? 0) >= 6;
    facts.push(
      slow
        ? `Google PageSpeed (mobile) scores the homepage ${audit.performance}/100${audit.largestPaintSeconds ? ` and the main content takes about ${audit.largestPaintSeconds} seconds to appear on a phone` : ""}.`
        : `The homepage loads quickly on phones (Google PageSpeed ${audit.performance}/100); speed is not a problem here.`,
    );
  }
  if (audit.https === false)
    facts.push("The site does not use HTTPS, so browsers mark it as not secure.");
  if (audit.mobileViewport === false)
    facts.push("The homepage has no mobile viewport tag, so it likely does not fit phone screens.");
  if (audit.copyrightYear && audit.copyrightYear <= now.getUTCFullYear() - 3)
    facts.push(`The footer copyright still says ${audit.copyrightYear}.`);
  if (audit.booking === false) facts.push("No online booking or appointment link was found.");
  if (audit.store === false) facts.push("No online store or cart was found.");
  if (audit.whatsapp === false) facts.push("No WhatsApp chat link was found.");
  if (audit.contactForm === false)
    facts.push("No contact or enquiry form was found on the pages read.");
  if (audit.readVia && audit.readVia !== "direct")
    facts.push(
      "The site could only be read with a full browser, which often means it loads slowly or relies heavily on JavaScript.",
    );
  if (!facts.length) return null;
  return {
    id: crypto.randomUUID(),
    url,
    title: "Website audit",
    text: facts.join(" ").slice(0, 3000),
    kind: "audit",
    retrievedAt: now.toISOString(),
  };
}

const appointmentTrade =
  /salon|spa|clinic|dental|dentist|doctor|physio|gym|fitness|yoga|restaurant|cafe|café|hotel|studio|tutor|coaching|academy|school|parlou?r|barber|veterin|hospital|diagnostic/i;
const retailTrade =
  /store|shop|boutique|cloth|apparel|garment|fashion|jewel|bakery|sweet|furniture|electronic|mobile|footwear|saree|textile|gift|toy|cosmetic|optical|hardware|wholesale/i;

// 0-100: how much a web studio could plausibly help, with reasons the team can read.
export function opportunityFor(input: {
  website: string;
  email: string | null;
  phone: string;
  evidence: Evidence[];
  audit?: Audit;
}) {
  const reasons: string[] = [];
  let score = 0;
  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(reason);
  };
  const listing = input.evidence.find((e) => e.kind === "listing")?.text || "";
  // The trade comes from the Maps category (or name), not page text: "restore" is not a store.
  const context = listing.match(/Category: ([^.]+)\./)?.[1] || listing.slice(0, 200);
  const reviews = Number(listing.match(/from (\d+) reviews/)?.[1] || 0);
  const a = input.audit;
  if (!input.website) add(45, "No website");
  if (a?.performance !== undefined) {
    const seconds = a.largestPaintSeconds ?? 0;
    if (a.performance < 50 || seconds >= 6)
      add(
        20,
        `Slow on mobile (${seconds >= 6 ? `${seconds}s to load, ` : ""}PageSpeed ${a.performance}/100)`,
      );
    else if (a.performance < 70) add(8, `Average mobile speed (PageSpeed ${a.performance}/100)`);
  }
  if (a?.mobileViewport === false) add(15, "Not mobile friendly");
  if (a?.https === false) add(10, "No HTTPS");
  if (a?.copyrightYear && a.copyrightYear <= new Date().getUTCFullYear() - 3)
    add(10, `Looks unmaintained (copyright ${a.copyrightYear})`);
  if (a?.readVia && a.readVia !== "direct") add(5, "Hard to load without a full browser");
  if (a?.booking === false && appointmentTrade.test(context)) add(10, "No online booking");
  if (a?.store === false && retailTrade.test(context)) add(10, "No online store");
  if (reviews >= 50) add(10, `Established (${reviews} Google reviews)`);
  if (input.email) add(5, "Email available");
  else if (!input.phone) add(-20, "No email or phone yet");
  return { score: Math.max(0, Math.min(100, score)), reasons: reasons.slice(0, 8) };
}
