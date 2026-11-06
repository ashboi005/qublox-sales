import { expect, test } from "bun:test";
import { searchGooglePlaces, searchOpenStreetMap, splitWebsite } from "./discovery";

test("social profiles are not treated as websites and tracking parameters are dropped", () => {
  expect(splitWebsite("https://www.instagram.com/sharmasweets/")).toEqual({
    website: "",
    instagram: "https://www.instagram.com/sharmasweets/",
  });
  expect(splitWebsite("https://facebook.com/page")).toEqual({ website: "", instagram: "" });
  expect(splitWebsite("https://shop.example/?utm_source=gmb&ref=1").website).toBe(
    "https://shop.example/?ref=1",
  );
  expect(splitWebsite(undefined)).toEqual({ website: "", instagram: "" });
});

test("Google Places pages are mapped to import records, skipping closed places", async () => {
  const bodies: { textQuery: string; pageToken?: string }[] = [];
  const result = await searchGooglePlaces(
    { what: "clothing stores", where: "Amritsar", limit: 40, campaignId: null },
    "key",
    async (url, init) => {
      expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
      expect((init!.headers as Record<string, string>)["X-Goog-FieldMask"]).toContain(
        "places.websiteUri",
      );
      bodies.push(JSON.parse(String(init!.body)));
      return Response.json(
        bodies.length === 1
          ? {
              places: [
                {
                  id: "a",
                  displayName: { text: "Kapoor Fabrics" },
                  internationalPhoneNumber: "+91 98140 00000",
                  websiteUri: "https://kapoorfabrics.in/?utm_source=gmb",
                  rating: 4.4,
                  userRatingCount: 120,
                  googleMapsUri: "https://maps.google.com/?cid=1",
                  primaryTypeDisplayName: { text: "Clothing store" },
                  formattedAddress: "Hall Bazaar, Amritsar",
                },
                {
                  id: "b",
                  displayName: { text: "Closed shop" },
                  businessStatus: "CLOSED_PERMANENTLY",
                },
              ],
              nextPageToken: "next",
            }
          : { places: [{ id: "c", displayName: { text: "Second page boutique" } }] },
      );
    },
  );
  expect(bodies).toEqual([
    { textQuery: "clothing stores in Amritsar", pageSize: 20 },
    { textQuery: "clothing stores in Amritsar", pageSize: 20, pageToken: "next" },
  ] as never);
  expect(result.requests).toBe(2);
  expect(result.records.map((r) => r.name)).toEqual(["Kapoor Fabrics", "Second page boutique"]);
  expect(result.records[0]).toMatchObject({
    website: "https://kapoorfabrics.in/",
    phone: "+91 98140 00000",
    rating: "4.4",
    reviews: "120",
    category: "Clothing store",
    url: "https://maps.google.com/?cid=1",
  });
});

test("a rejected Places key explains what to enable", async () => {
  await expect(
    searchGooglePlaces(
      { what: "cafes", where: "Pune", limit: 20, campaignId: null },
      "bad",
      async () => new Response("{}", { status: 403 }),
    ),
  ).rejects.toThrow("Places API (New)");
});

test("OpenStreetMap results keep tagged contacts and skip unnamed places", async () => {
  const result = await searchOpenStreetMap(
    { what: "dentist", where: "Pune", limit: 20, campaignId: null },
    "Qublox",
    async (url, init) => {
      expect(url).toContain("q=dentist+in+Pune");
      expect((init!.headers as Record<string, string>)["User-Agent"]).toContain("QubloxSales");
      return Response.json([
        {
          osm_type: "node",
          osm_id: 42,
          name: "Smile Dental",
          display_name: "Smile Dental, Baner, Pune",
          type: "dentist",
          extratags: {
            "contact:phone": "+91 20 1234 5678;+91 98000 00000",
            website: "https://smile.example",
          },
        },
        { osm_type: "way", osm_id: 7, name: "", display_name: "Unnamed", type: "dentist" },
      ]);
    },
  );
  expect(result.records).toEqual([
    expect.objectContaining({
      name: "Smile Dental",
      phone: "+91 20 1234 5678",
      website: "https://smile.example/",
      url: "https://www.openstreetmap.org/node/42",
    }),
  ]);
});
