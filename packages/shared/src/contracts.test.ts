import { describe, expect, test } from "bun:test";
import { prospectInput, normalizeWebsite, aiDraftSchema, validateDraftEvidence } from "./index";

describe("prospect boundaries", () => {
  test("normalizes a business URL for cross-campaign deduplication", () => {
    expect(normalizeWebsite("www.example.com/products?utm_source=maps#top")).toEqual({
      website: "https://www.example.com/", domain: "example.com",
    });
  });
  test("rejects URLs containing credentials or non-web protocols", () => {
    expect(() => normalizeWebsite("https://user:password@example.com")).toThrow();
    expect(() => normalizeWebsite("javascript:alert(1)")).toThrow();
  });
  test("normalizes email and leaves absence distinct from verification", () => {
    const result = prospectInput.parse({ name: " Store ", website: "https://example.com", email: " HELLO@example.com " });
    expect(result.email).toBe("hello@example.com");
    expect(result.name).toBe("Store");
    expect(prospectInput.parse({ name: "Store", website: "example.com" }).email).toBeNull();
  });
});

describe("AI draft evidence", () => {
  const id = "2faf79c2-6349-411e-b39b-7334f95f50a3";
  test("refuses invented evidence references", () => {
    const draft = aiDraftSchema.parse({ score: 2, rationale: "Relevant enquiry flow", evidenceIds: [id], subject: "Your enquiry flow", body: "A concrete proposal" });
    expect(() => validateDraftEvidence(draft, [])).toThrow();
  });
  test("does not accept a personalized draft without supporting evidence", () => {
    const draft = aiDraftSchema.parse({ score: 2, rationale: "Relevant", evidenceIds: [], subject: "Hello", body: "Hello" });
    expect(() => validateDraftEvidence(draft, [])).toThrow();
  });
  test("score zero discards generic copy", () => {
    const draft = aiDraftSchema.parse({ score: 0, rationale: "No relevant evidence", evidenceIds: [], subject: "Generic pitch", body: "We build everything" });
    expect(validateDraftEvidence(draft, [])).toMatchObject({ subject: "", body: "", score: 0 });
  });
});
