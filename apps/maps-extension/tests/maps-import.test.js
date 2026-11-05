import { expect, test } from "bun:test";
import { mapsEnvelope, parseMapsRecords } from "../../web/src/lib/maps-import";
test("extension envelopes and import batches are bounded", () => {
  expect(
    mapsEnvelope.safeParse({
      source: "qublox-maps",
      kind: "available",
      nonce: crypto.randomUUID(),
      count: 5,
    }).success,
  ).toBe(true);
  expect(
    mapsEnvelope.safeParse({
      source: "some-website",
      kind: "records",
      nonce: crypto.randomUUID(),
      records: [],
    }).success,
  ).toBe(false);
  expect(() => parseMapsRecords(JSON.stringify(Array(101).fill({ name: "Too many" })))).toThrow();
  expect(() => parseMapsRecords('[{"name":"' + "x".repeat(850_001) + '"}]')).toThrow("850 KB");
  expect(parseMapsRecords('[{"name":"Hotel","website":""}]')).toHaveLength(1);
});
