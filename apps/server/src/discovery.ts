import { z } from "zod";
import { and, desc, eq, gte, or, sql, sum } from "drizzle-orm";
import type { Database } from "@qublox-sales/db";
import { leadSearches, prospects, suppressions } from "@qublox-sales/db/schema/sales";
import type { SalesConfig } from "./config";
import { AppError } from "./errors";
import { identity, newId } from "./sales";
import { isSocialOrDirectory, phoneKey } from "@qublox-sales/shared";

// Finds businesses for a niche and place from inside the portal, then hands them to the
// normal import (dedupe, suppression, Maps-listing evidence, automatic research/draft).
// Google Places API (New) is used when a key is configured; OpenStreetMap otherwise.

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
export type LeadRecord = Record<string, string>;
export const leadSearchInput = z.object({
  what: z.string().trim().min(2).max(100),
  where: z.string().trim().min(2).max(100),
  limit: z.union([z.literal(20), z.literal(40), z.literal(60)]).default(20),
  campaignId: z.uuid().nullable().default(null),
});
export type LeadSearchInput = z.infer<typeof leadSearchInput>;

// Social profiles are not websites we can research; keep Instagram as a contact instead.
export function splitWebsite(uri: string | undefined) {
  if (!uri) return { website: "", instagram: "" };
  try {
    const url = new URL(uri);
    const host = url.hostname.replace(/^www\./, "");
    if (/(^|\.)instagram\.com$/.test(host))
      return { website: "", instagram: `https://www.instagram.com${url.pathname}` };
    if (isSocialOrDirectory(url.toString())) return { website: "", instagram: "" };
    for (const key of [...url.searchParams.keys()])
      if (/^(utm_|gclid|fbclid)/i.test(key)) url.searchParams.delete(key);
    return { website: url.toString(), instagram: "" };
  } catch {
    return { website: "", instagram: "" };
  }
}

const googlePlace = z.object({
  id: z.string(),
  displayName: z.object({ text: z.string() }).optional(),
  formattedAddress: z.string().optional(),
  nationalPhoneNumber: z.string().optional(),
  internationalPhoneNumber: z.string().optional(),
  websiteUri: z.string().optional(),
  rating: z.number().optional(),
  userRatingCount: z.number().optional(),
  googleMapsUri: z.string().optional(),
  primaryTypeDisplayName: z.object({ text: z.string() }).optional(),
  businessStatus: z.string().optional(),
});
const googlePage = z.object({
  places: z.array(googlePlace).default([]),
  nextPageToken: z.string().optional(),
});
const fieldMask = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  "places.primaryTypeDisplayName",
  "places.businessStatus",
  "nextPageToken",
].join(",");

// Businesses already in the workspace (or blocked) are skipped while paging, so repeating
// a search continues to the next new ones instead of re-finding the same 20.
export type IsKnown = (record: LeadRecord) => Promise<boolean>;
export async function searchGooglePlaces(
  input: LeadSearchInput,
  key: string,
  fetcher: Fetcher = fetch,
  isKnown: IsKnown = async () => false,
  maxRequests = 3,
) {
  const records: LeadRecord[] = [];
  let pageToken: string | undefined,
    requests = 0,
    known = 0;
  const now = new Date().toISOString();
  do {
    requests++;
    const response = await fetcher("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": fieldMask,
      },
      body: JSON.stringify({
        textQuery: `${input.what} in ${input.where}`,
        pageSize: 20,
        ...(pageToken ? { pageToken } : {}),
      }),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new AppError(
        502,
        "PLACES_FAILED",
        response.status === 403 || response.status === 400
          ? "Google rejected the Places key. Enable “Places API (New)” and billing for that key's Google Cloud project."
          : response.status === 429
            ? "Google's Places quota is used up for now. Try again later."
            : `Google Places returned HTTP ${response.status}. Try again shortly.`,
      );
    }
    const page = googlePage.parse(await response.json());
    for (const place of page.places) {
      if (place.businessStatus && place.businessStatus !== "OPERATIONAL") continue;
      if (!place.displayName?.text) continue;
      const record: LeadRecord = {
        name: place.displayName.text,
        ...splitWebsite(place.websiteUri),
        phone: place.internationalPhoneNumber || place.nationalPhoneNumber || "",
        address: place.formattedAddress || "",
        rating: place.rating === undefined ? "" : String(place.rating),
        reviews: place.userRatingCount === undefined ? "" : String(place.userRatingCount),
        category: place.primaryTypeDisplayName?.text || "",
        url: place.googleMapsUri || `https://www.google.com/maps/place/?q=place_id:${place.id}`,
        scrapedAt: now,
      };
      if (await isKnown(record)) known++;
      else records.push(record);
    }
    pageToken = page.nextPageToken;
  } while (pageToken && records.length < input.limit && requests < Math.min(3, maxRequests));
  return {
    records: records.slice(0, input.limit),
    requests,
    known,
    // Google stops at 60 results per phrase; no token means this phrase is used up.
    exhausted: !pageToken,
    provider: "google" as const,
  };
}

const nominatimPlace = z.object({
  osm_type: z.string(),
  osm_id: z.number(),
  name: z.string().optional().default(""),
  display_name: z.string().optional().default(""),
  type: z.string().optional().default(""),
  extratags: z.record(z.string(), z.string()).nullable().optional(),
});

// Free and keyless, but far fewer Indian businesses carry phone or website tags.
// One request per search, within Nominatim's usage policy for light interactive use.
export async function searchOpenStreetMap(
  input: LeadSearchInput,
  company: string,
  fetcher: Fetcher = fetch,
  isKnown: IsKnown = async () => false,
) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({
    q: `${input.what} in ${input.where}`,
    format: "jsonv2",
    limit: String(Math.min(40, input.limit)),
    extratags: "1",
  }).toString();
  const response = await fetcher(url.toString(), {
    signal: AbortSignal.timeout(15000),
    headers: { "User-Agent": `QubloxSales/1.0 (${company} internal lead research)` },
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new AppError(
      502,
      "OSM_FAILED",
      `OpenStreetMap search returned HTTP ${response.status}. Try again in a minute.`,
    );
  }
  const now = new Date().toISOString();
  const places = z.array(nominatimPlace).parse(await response.json());
  const records = places
    .filter((p) => p.name)
    .map((p) => {
      const tags = p.extratags || {};
      return {
        name: p.name,
        ...splitWebsite(tags.website || tags["contact:website"]),
        phone: (tags.phone || tags["contact:phone"] || tags["contact:mobile"] || "").split(";")[0]!,
        email: (tags.email || tags["contact:email"] || "").split(";")[0]!.trim().toLowerCase(),
        address: p.display_name,
        category: p.type.replaceAll("_", " "),
        url: `https://www.openstreetmap.org/${p.osm_type}/${p.osm_id}`,
        scrapedAt: now,
      };
    });
  const fresh: LeadRecord[] = [];
  let known = 0;
  for (const record of records) {
    if (await isKnown(record)) known++;
    else fresh.push(record);
  }
  return {
    records: fresh,
    requests: 1,
    known,
    exhausted: true,
    provider: "openstreetmap" as const,
  };
}

export function leadSearchService(
  db: Database,
  config: SalesConfig,
  importRecords: (
    records: Record<string, unknown>[],
    campaignId: string | null,
    actor: string,
  ) => Promise<{ added: number; duplicates: number; invalid: { row: number; reason: string }[] }>,
  fetcher: Fetcher = fetch,
) {
  const provider = () => (config.GOOGLE_PLACES_API_KEY ? "google" : "openstreetmap");
  const monthStart = () => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  };
  const placesUsed = async () => {
    const [row] = await db
      .select({ value: sum(leadSearches.requests) })
      .from(leadSearches)
      .where(and(eq(leadSearches.provider, "google"), gte(leadSearches.createdAt, monthStart())));
    return Number(row?.value || 0);
  };
  // Already in the list (same listing, website or phone) or on the do-not-contact list.
  const isKnown: IsKnown = async (record) => {
    let id: ReturnType<typeof identity>;
    try {
      id = identity({ website: record.website || "", phone: record.phone || "" });
    } catch {
      id = { website: "", domain: null, phoneKey: phoneKey(record.phone || "") };
    }
    const [prospect] = await db
      .select({ id: prospects.id })
      .from(prospects)
      .where(
        or(
          record.url ? eq(prospects.sourceUrl, record.url) : undefined,
          id.domain ? eq(prospects.domain, id.domain) : undefined,
          id.phoneKey ? eq(prospects.phoneKey, id.phoneKey) : undefined,
        ) || sql`false`,
      )
      .limit(1);
    if (prospect) return true;
    if (!id.domain && !id.phoneKey) return false;
    const [blocked] = await db
      .select({ id: suppressions.id })
      .from(suppressions)
      .where(
        or(
          id.domain ? eq(suppressions.domain, id.domain) : undefined,
          id.phoneKey ? eq(suppressions.phoneKey, id.phoneKey) : undefined,
        ),
      )
      .limit(1);
    return Boolean(blocked);
  };
  return {
    provider,
    placesUsed,
    async recent() {
      return db.select().from(leadSearches).orderBy(desc(leadSearches.createdAt)).limit(15);
    },
    async run(input: LeadSearchInput, actor: string) {
      const selected = provider();
      const remaining = config.PLACES_MONTHLY_REQUEST_LIMIT - (await placesUsed());
      if (selected === "google") {
        if (remaining < 1)
          throw new AppError(
            429,
            "PLACES_ALLOWANCE",
            `This month's Places allowance (${config.PLACES_MONTHLY_REQUEST_LIMIT} requests) is used. It resets on the 1st, or raise PLACES_MONTHLY_REQUEST_LIMIT.`,
          );
      }
      const id = newId();
      let result: Awaited<ReturnType<typeof searchGooglePlaces | typeof searchOpenStreetMap>>;
      try {
        result =
          selected === "google"
            ? await searchGooglePlaces(
                input,
                config.GOOGLE_PLACES_API_KEY,
                fetcher,
                isKnown,
                remaining,
              )
            : await searchOpenStreetMap(input, config.COMPANY_NAME, fetcher, isKnown);
      } catch (error) {
        const message =
          error instanceof AppError ? error.message : "The business search could not complete.";
        await db.insert(leadSearches).values({
          id,
          what: input.what,
          location: input.where,
          provider: selected,
          requests: 1,
          campaignId: input.campaignId,
          actor,
          error: message,
        });
        if (error instanceof AppError) throw error;
        throw new AppError(502, "SEARCH_FAILED", message);
      }
      const imported = result.records.length
        ? await importRecords(result.records, input.campaignId, actor)
        : { added: 0, duplicates: 0, invalid: [] };
      const [row] = await db
        .insert(leadSearches)
        .values({
          id,
          what: input.what,
          location: input.where,
          provider: result.provider,
          requests: result.requests,
          found: result.records.length + result.known,
          added: imported.added,
          duplicates: imported.duplicates + result.known,
          skipped: imported.invalid.length,
          campaignId: input.campaignId,
          actor,
        })
        .returning();
      return { ...row!, exhausted: result.exhausted };
    },
  };
}
