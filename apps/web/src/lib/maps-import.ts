import { z } from "zod";
const batch = z.array(z.record(z.string(), z.unknown())).min(1).max(100);
export const mapsEnvelope = z.discriminatedUnion("kind", [
  z.object({
    source: z.literal("qublox-maps"),
    kind: z.literal("available"),
    nonce: z.uuid(),
    count: z.number().int().min(1).max(100),
  }),
  z.object({
    source: z.literal("qublox-maps"),
    kind: z.literal("records"),
    nonce: z.uuid(),
    records: batch,
  }),
]);
export function parseMapsRecords(input: string) {
  if (new TextEncoder().encode(input).byteLength > 850_000)
    throw new Error("Keep the collection below 850 KB.");
  return batch.parse(JSON.parse(input));
}
