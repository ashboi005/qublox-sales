import { z } from "zod";
import { and, desc, eq, gte, sum } from "drizzle-orm";
import type { Database } from "@qublox-sales/db";
import { leadSearches } from "@qublox-sales/db/schema/sales";
import type { SalesConfig } from "./config";
import { AppError } from "./errors";
import { newId } from "./sales";

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
    if (/(^|\.)(facebook\.com|fb\.com|wa\.me|whatsapp\.com|linktr\.ee|google\.com)$/.test(host))
      return { website: "", instagram: "" };
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

export async function searchGooglePlaces(
  input: LeadSearchInput,
  key: string,
  fetcher: Fetcher = fetch,
) {
  const records: LeadRecord[] = [];
  let pageToken: string | undefined,
    requests = 0;
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
      records.push({
        name: place.displayName.text,
        ...splitWebsite(place.websiteUri),
        phone: place.internationalPhoneNumber || place.nationalPhoneNumber || "",
        address: place.formattedAddress || "",
        rating: place.rating === undefined ? "" : String(place.rating),
        reviews: place.userRatingCount === undefined ? "" : String(place.userRatingCount),
        category: place.primaryTypeDisplayName?.text || "",
        url: place.googleMapsUri || `https://www.google.com/maps/place/?q=place_id:${place.id}`,
        scrapedAt: now,
      });
    }
    pageToken = page.nextPageToken;
  } while (pageToken && records.length < input.limit && requests < 3);
  return { records: records.slice(0, input.limit), requests, provider: "google" as const };
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
  return { records, requests: 1, provider: "openstreetmap" as const };
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
  return {
    provider,
    placesUsed,
    async recent() {
      return db.select().from(leadSearches).orderBy(desc(leadSearches.createdAt)).limit(15);
    },
    async run(input: LeadSearchInput, actor: string) {
      const selected = provider();
      if (selected === "google") {
        const needed = Math.ceil(input.limit / 20);
        if ((await placesUsed()) + needed > config.PLACES_MONTHLY_REQUEST_LIMIT)
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
            ? await searchGooglePlaces(input, config.GOOGLE_PLACES_API_KEY, fetcher)
            : await searchOpenStreetMap(input, config.COMPANY_NAME, fetcher);
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
          found: result.records.length,
          added: imported.added,
          duplicates: imported.duplicates,
          skipped: imported.invalid.length,
          campaignId: input.campaignId,
          actor,
        })
        .returning();
      return row!;
    },
  };
}
