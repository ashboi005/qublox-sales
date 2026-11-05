import { expect, test } from "bun:test";
import { parseGatewayResponse, buildDraftRequest } from "./gateway";
const id = "2faf79c2-6349-411e-b39b-7334f95f50a3";
const evidence = [
  {
    id,
    kind: "website" as const,
    url: "https://example.com",
    title: "Contact",
    text: "Email your registration details.",
    retrievedAt: "2026-11-05T10:00:00.000Z",
  },
];
test("validates Gateway output and accounts for the Merge fee", () => {
  const parsed = parseGatewayResponse(
    {
      choices: [
        {
          message: {
            content: JSON.stringify({
              score: 2,
              rationale: "Manual registration",
              evidenceIds: [id],
              subject: "Registrations",
              body: "Could a form help?",
            }),
          },
        },
      ],
      usage: { cost: 0.001 },
      routing: { merge_fee_usd: 0.00005 },
    },
    evidence,
  );
  expect(parsed.costMicros).toBe(1050);
  expect(parsed.draft.score).toBe(2);
});
test("rejects model output that references an invented source", () => {
  expect(() =>
    parseGatewayResponse(
      {
        choices: [
          {
            message: {
              content: JSON.stringify({
                score: 2,
                rationale: "Invented",
                evidenceIds: [id],
                subject: "Hello",
                body: "Hi",
              }),
            },
          },
        ],
        usage: { cost: 0 },
      },
      [],
    ),
  ).toThrow();
});
test("caps source text in the request and supplies no model tools", () => {
  const request = buildDraftRequest(
    { name: "Store", channel: "email", evidence: [{ ...evidence[0]!, text: "x".repeat(100000) }] },
    {
      name: "Registration",
      audience: "Workshops",
      offer: "Form",
      proof: "",
      callToAction: "Can I show you?",
    },
    "provider/cheap-model",
  );
  expect(JSON.stringify(request).length).toBeLessThan(15000);
  expect(request.max_tokens).toBe(1200);
  expect(request).not.toHaveProperty("tools");
});
