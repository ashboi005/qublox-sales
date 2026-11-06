import { expect, test } from "bun:test";
import { salesConfig } from "./config";
import {
  buildDraftRequest,
  parseDraftResponse,
  backoffMs,
  limitsFor,
  providerFor,
  providersFor,
  retryAt,
  quotaWait,
  normalizeProviderResponse,
  providerRequest,
} from "./llm-provider";
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
const campaign = {
  name: "Registration",
  audience: "Workshops",
  offer: "Form",
  proof: "",
  callToAction: "Can I show you?",
};
const answer = {
  score: 2,
  rationale: "Manual registration",
  evidenceIds: [id],
  subject: "Registrations",
  body: "Could a form help?",
};
test("provider selection uses fixed endpoints and rejects unsupported models", () => {
  expect(providerFor(salesConfig({}))).toMatchObject({
    provider: "groq",
    model: "openai/gpt-oss-20b",
  });
  expect(providerFor(salesConfig({ LLM_PROVIDER: "gemini" }))).toMatchObject({
    model: "gemini-3.5-flash-lite",
  });
  expect(() => salesConfig({ LLM_PROVIDER: "groq", LLM_MODEL: "gemini-2.5-flash-lite" })).toThrow();
});
test("draft request bounds UTF-8 input and disables tools and expensive reasoning", () => {
  for (const provider of ["groq", "gemini"]) {
    const selected = providerFor(salesConfig({ LLM_PROVIDER: provider }));
    const request = buildDraftRequest(
      {
        name: "Store",
        channel: "email",
        evidence: [{ ...evidence[0]!, text: "漢".repeat(100000) }],
      },
      { ...campaign, offer: "漢".repeat(2000) },
      selected,
    );
    expect(Buffer.byteLength(JSON.stringify(request.messages))).toBeLessThanOrEqual(7500);
    expect(request.max_tokens).toBe(1600);
    expect(request).not.toHaveProperty("tools");
    expect(request).not.toHaveProperty("include_routing_metadata");
    expect(request.reasoning_effort).toBe(provider === "groq" ? "low" : "minimal");
  }
});
test("validated responses use token-based list-price estimates, never Merge fees", () => {
  const p = providerFor(salesConfig({}));
  const result = parseDraftResponse(
    {
      choices: [{ message: { content: JSON.stringify(answer) }, finish_reason: "stop" }],
      usage: { prompt_tokens: 2000, completion_tokens: 800 },
    },
    evidence,
    p,
  );
  expect(result.costMicros).toBe(390);
  expect(result.draft.score).toBe(2);
  expect(() =>
    parseDraftResponse({ choices: [{ message: { content: JSON.stringify(answer) } }] }, [], p),
  ).toThrow();
  expect(() =>
    parseDraftResponse(
      { choices: [{ message: { content: JSON.stringify(answer) }, finish_reason: "length" }] },
      evidence,
      p,
    ),
  ).toThrow();
});
test("Retry-After supports seconds, dates and quota reset durations", () => {
  const now = new Date("2026-11-05T10:00:00Z");
  expect(retryAt(new Headers({ "retry-after": "120" }), now).getTime()).toBe(
    now.getTime() + 120000,
  );
  expect(
    retryAt(new Headers({ "retry-after": "Thu, 05 Nov 2026 10:03:00 GMT" }), now).getTime(),
  ).toBe(now.getTime() + 180000);
  expect(
    retryAt(
      new Headers({
        "x-ratelimit-remaining-requests": "0",
        "x-ratelimit-reset-requests": "1h2m3s",
      }),
      now,
    ).getTime(),
  ).toBe(now.getTime() + 3723000);
});
test("quota decisions enforce pacing, rolling tokens/day and persistent cooldown", () => {
  const now = new Date("2026-11-05T10:00:00Z"),
    c = { rpm: 1, rpd: 20, tpm: 8000, tpd: 100000 };
  const recent = [{ createdAt: new Date(now.getTime() - 10000), quotaTokens: 7000 }];
  expect(quotaWait(recent, c, now, 7000, null)?.getTime()).toBe(now.getTime() + 50000);
  expect(quotaWait([], c, now, 7000, new Date(now.getTime() + 120000))?.getTime()).toBe(
    now.getTime() + 120000,
  );
  expect(
    quotaWait(
      Array.from({ length: 20 }, (_, i) => ({
        createdAt: new Date(now.getTime() - 3600000 - i),
        quotaTokens: 1,
      })),
      c,
      now,
      1,
      null,
    )!.getTime(),
  ).toBeGreaterThan(now.getTime() + 22 * 3600000);
  expect(() => quotaWait([], { ...c, tpm: 100 }, now, 7000, null)).toThrow();
});
test("both keys rotate providers, primary first; LLM_ROTATE=false keeps one", () => {
  const both = { GROQ_API_KEY: "g", GEMINI_API_KEY: "m" };
  expect(providersFor(salesConfig(both)).map((p) => p.provider)).toEqual(["groq", "gemini"]);
  expect(
    providersFor(salesConfig({ ...both, LLM_PROVIDER: "gemini" })).map((p) => [
      p.provider,
      p.model,
    ]),
  ).toEqual([
    ["gemini", "gemini-3.5-flash-lite"],
    ["groq", "openai/gpt-oss-20b"],
  ]);
  expect(providersFor(salesConfig({ ...both, LLM_ROTATE: "false" }))).toHaveLength(1);
  expect(providersFor(salesConfig({ GEMINI_API_KEY: "m" })).map((p) => p.provider)).toEqual([
    "gemini",
  ]);
  // LLM_MODEL only applies to the primary provider.
  expect(
    providersFor(salesConfig({ ...both, LLM_MODEL: "openai/gpt-oss-120b" })).map((p) => p.model),
  ).toEqual(["openai/gpt-oss-120b", "gemini-3.5-flash-lite"]);
  expect(limitsFor(salesConfig({}), "groq")).toEqual({
    rpm: 20,
    rpd: 800,
    tpm: 8000,
    tpd: 180000,
  });
});
test("rate-limit backoff starts at 2 minutes, doubles and caps at 30", () => {
  expect([0, 1, 2, 3, 4, 10].map(backoffMs)).toEqual([
    120000, 240000, 480000, 960000, 1800000, 1800000,
  ]);
});

test("native Gemini object/chunked responses preserve final text and account for thinking tokens", () => {
  const p = providerFor(salesConfig({ LLM_PROVIDER: "gemini" }));
  const chunks = [
    {
      candidates: [
        {
          content: { parts: [{ text: "private thought", thought: true }, { text: '{"score":0,' }] },
        },
      ],
    },
    {
      candidates: [
        {
          content: {
            parts: [{ text: '"rationale":"No signal","evidenceIds":[],"subject":"","body":""}' }],
          },
          finishReason: "STOP",
        },
      ],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 30 },
    },
  ];
  const normalized = normalizeProviderResponse(chunks, p);
  const result = parseDraftResponse(normalized, [], p);
  expect(result.draft.score).toBe(0);
  expect(result.costMicros).toBe(155);
  const wire = providerRequest(
    buildDraftRequest({ name: "Store", channel: "email", evidence }, campaign, p),
    p,
  );
  expect(wire.headers).toHaveProperty("x-goog-api-key");
  expect(wire.headers).not.toHaveProperty("Authorization");
});
test("draft instructions carry the humanized voice, sender placeholder and company", () => {
  const selected = providerFor(salesConfig({}));
  const request = buildDraftRequest(
    { name: "Sharma Hotel", channel: "email", evidence, contactName: "Ravi" },
    campaign,
    selected,
    "Qublox",
  );
  const system = request.messages[0]!.content;
  expect(system).toContain("{{sender}} here from Qublox.");
  expect(system).toContain("never use em dashes");
  expect(system).toContain("UNTRUSTED DATA");
  expect(JSON.parse(request.messages[1]!.content)).toMatchObject({ contactName: "Ravi" });
  expect(
    buildDraftRequest({ name: "X", channel: "whatsapp", evidence }, campaign, selected).messages[0]!
      .content,
  ).toContain("Subject: empty string.");
});
test("model output is cleaned of dashes, curly quotes and bracket name placeholders", () => {
  const p = providerFor(salesConfig({}));
  const { draft } = parseDraftResponse(
    {
      choices: [
        {
          message: {
            content: JSON.stringify({
              ...answer,
              subject: "Quick idea — bookings",
              body: "Hi team,\n\n[Your Name] here from Qublox. Your menu — it’s clear.\n\nThanks,\n[Your Name]",
            }),
          },
          finish_reason: "stop",
        },
      ],
    },
    evidence,
    p,
  );
  expect(draft.subject).toBe("Quick idea, bookings");
  expect(draft.body).toBe(
    "Hi team,\n\n{{sender}} here from Qublox. Your menu, it's clear.\n\nThanks,\n{{sender}}",
  );
});
test("audit and listing evidence go to the model first and survive trimming", () => {
  const at = new Date().toISOString();
  const long = (n: number) => ({
    id: `w${n}`,
    url: `https://site.example/${n}`,
    title: "Page",
    text: "Long page text about the business. ".repeat(40),
    kind: "website" as const,
    retrievedAt: at,
  });
  const request = buildDraftRequest(
    {
      name: "Clinic",
      channel: "email",
      evidence: [
        long(1),
        long(2),
        long(3),
        long(4),
        long(5),
        long(6),
        {
          id: "audit",
          url: "https://site.example/",
          title: "Website audit",
          text: "Google PageSpeed (mobile) scores the homepage 47/100.",
          kind: "audit",
          retrievedAt: at,
        },
      ],
    },
    campaign,
    providerFor(salesConfig({})),
  );
  const sent = JSON.parse(request.messages[1]!.content).evidence;
  expect(sent[0].id).toBe("audit");
  expect(sent).toHaveLength(6);
});
