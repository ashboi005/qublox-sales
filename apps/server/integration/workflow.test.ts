import { salesConfig } from "../src/config";
import { LlmDeferred } from "../src/llm-provider";
import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { createDb } from "@qublox-sales/db";
import { createAuth } from "@qublox-sales/auth";
import { teamMember } from "@qublox-sales/db/schema/team";
import { user } from "@qublox-sales/db/schema/auth";
import {
  provisionTeamAccount,
  disableTeamAccount,
  migrateLegacyTeam,
  setTeamRole,
} from "@qublox-sales/auth/provision";
import { createApp } from "../src/app";
import type { Campaign, Prospect } from "@qublox-sales/shared";
import { createSalesService } from "../src/sales";
import { claimJob, processJob } from "../src/jobs";
import { generateDraft } from "../src/llm";
import { jobs, llmUsage, llmProviderState, prospects } from "@qublox-sales/db/schema/sales";
import { eq } from "drizzle-orm";
import { prospectInput } from "@qublox-sales/shared";

if (!process.env.DATABASE_URL?.endsWith("/qublox_sales_test"))
  throw new Error("Integration tests require the isolated qublox_sales_test database.");
const db = createDb({ DATABASE_URL: process.env.DATABASE_URL });
const origin = "http://localhost:3001";
const config = salesConfig({
  LLM_MONTHLY_BUDGET_USD: 5,
  DAILY_CONTACT_LIMIT: 1,
  BETTER_AUTH_SECRET: "integration-test-only-secret-at-least-thirty-two-characters",
});
const checkedLogins: string[] = [];
const authConfig = {
  BETTER_AUTH_URL: origin,
  BETTER_AUTH_SECRET: "integration-test-only-secret-at-least-thirty-two-characters",
  CORS_ORIGIN: origin,
};
const auth = createAuth(authConfig, db);
const app = createApp({
  db,
  auth,
  origin,
  config,
  verifyMailbox: async (m) => {
    checkedLogins.push(m.email);
    if (m.appPassword === "wrongwrongwrong1") throw new Error("Gmail rejected this App Password.");
  },
});
let cookie = "";
async function request<T = Prospect>(
  path: string,
  method = "GET",
  body?: unknown,
  options: { anonymous?: boolean; foreignOrigin?: boolean } = {},
) {
  const headers: Record<string, string> = {
    Origin: options.foreignOrigin ? "https://attacker.example" : origin,
  };
  if (!options.anonymous) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await app.handle(
    new Request(`${origin}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  return { response, data: (await response.json()) as T };
}

beforeAll(async () => {
  await db.$client.query(
    'TRUNCATE "user", campaign, prospect, activity, suppression, job, llm_usage, llm_provider_state CASCADE',
  );
  await provisionTeamAccount(authConfig, db, {
    name: "Qublox test",
    email: "test@qublox.local",
    password: "local-test-password-123",
  });
  const response = await app.handle(
    new Request(`${origin}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@qublox.local", password: "local-test-password-123" }),
    }),
  );
  expect(response.status).toBe(200);
  cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  expect(cookie).toContain("session_token");
});
afterAll(async () => {
  await db.$client.end();
});

describe("private workspace", () => {
  test("anonymous users cannot read prospect data", async () => {
    expect(
      (await request("/api/prospects", "GET", undefined, { anonymous: true })).response.status,
    ).toBe(401);
  });
  test("unlisted email cannot create an account", async () => {
    const result = await request(
      "/api/auth/sign-up/email",
      "POST",
      { name: "Stranger", email: "stranger@example.com", password: "long-test-password-123" },
      { anonymous: true },
    );
    expect(result.response.status).toBe(400);
  });
  test("knowing an allowlisted email does not allow public account creation", async () => {
    const result = await request(
      "/api/auth/sign-up/email",
      "POST",
      { name: "Impersonator", email: "test@qublox.local", password: "different-test-password-123" },
      { anonymous: true },
    );
    expect(result.response.status).toBe(400);
  });
  test("offline team:add grants database access without an environment allowlist", async () => {
    await provisionTeamAccount(authConfig, db, {
      name: "New member",
      email: "new-member@example.com",
      password: "new-member-test-password-123",
    });
    const member = (
      await db.select().from(user).where(eq(user.email, "new-member@example.com"))
    )[0]!;
    expect(
      (await db.select().from(teamMember).where(eq(teamMember.userId, member.id)))[0]!.active,
    ).toBe(true);
    const login = await auth.api.signInEmail({
      body: { email: member.email, password: "new-member-test-password-123" },
      asResponse: true,
    });
    expect(login.status).toBe(200);
    const headers = {
      Cookie: login.headers
        .getSetCookie()
        .map((v) => v.split(";")[0])
        .join("; "),
    };
    expect((await app.handle(new Request(`${origin}/api/prospects`, { headers }))).status).toBe(
      200,
    );
    await disableTeamAccount(db, member.email);
    expect((await app.handle(new Request(`${origin}/api/prospects`, { headers }))).status).toBe(
      401,
    );
    const rejected = await auth.api.signInEmail({
      body: { email: member.email, password: "new-member-test-password-123" },
      asResponse: true,
    });
    expect(rejected.status).toBeGreaterThanOrEqual(400);
  });
  test("foreign-origin mutations are rejected", async () => {
    expect(
      (await request("/api/campaigns", "POST", {}, { foreignOrigin: true })).response.status,
    ).toBe(403);
  });
});

test("campaign → evidence → approval → contact, with stale edits and suppression blocked", async () => {
  const { data: campaign } = await request<Campaign>("/api/campaigns", "POST", {
    name: "Enquiry flow",
    audience: "Small workshops",
    offer: "A registration form",
    proof: "",
    callToAction: "Can I show an example?",
  });
  expect(campaign.id).toBeString();
  let { data: lead } = await request("/api/prospects", "POST", {
    name: "Workshop",
    website: "https://example.com",
    email: "owner@example.com",
    campaignId: campaign.id,
  });
  expect(lead.verificationStatus).toBe("unverified");
  const evidence = await request(`/api/prospects/${lead.id}/evidence`, "POST", {
    version: lead.version,
    url: "https://example.com/events",
    title: "Registration",
    text: "Email us your registration details.",
  });
  lead = evidence.data;
  const saved = await request(`/api/prospects/${lead.id}/draft`, "PUT", {
    version: lead.version,
    score: 2,
    rationale: "A public manual registration flow",
    evidenceIds: [lead.evidence[0]!.id],
    subject: "Workshop registrations",
    body: "Hi [Owner Name], could a registration form help?",
  });
  lead = saved.data;
  const placeholder = await request<{ error: { code: string } }>(
    `/api/prospects/${lead.id}/actions`,
    "POST",
    { version: lead.version, action: "approve" },
  );
  expect(placeholder.response.status).toBe(422);
  expect(placeholder.data.error.code).toBe("PLACEHOLDER");
  lead = (
    await request(`/api/prospects/${lead.id}/draft`, "PUT", {
      version: lead.version,
      score: 2,
      rationale: "A public manual registration flow",
      evidenceIds: [lead.evidence[0]!.id],
      subject: "Workshop registrations",
      body: "Hi team, {{sender}} here. Could a registration form help?",
    })
  ).data;
  lead = (
    await request(`/api/prospects/${lead.id}/actions`, "POST", {
      version: lead.version,
      action: "approve",
    })
  ).data;
  expect(lead.status).toBe("approved");
  expect(lead.approvalVersion).toBe(lead.version);
  const stale = lead.version;
  lead = (
    await request(`/api/prospects/${lead.id}`, "PATCH", {
      ...lead,
      email: "new@example.com",
      version: lead.version,
    })
  ).data;
  expect(lead.status).toBe("review");
  expect(lead.approvalVersion).toBeNull();
  expect(
    (
      await request(`/api/prospects/${lead.id}/actions`, "POST", {
        version: stale,
        action: "contacted",
      })
    ).response.status,
  ).toBe(409);
  lead = (
    await request(`/api/prospects/${lead.id}/actions`, "POST", {
      version: lead.version,
      action: "approve",
    })
  ).data;
  lead = (
    await request(`/api/prospects/${lead.id}/actions`, "POST", {
      version: lead.version,
      action: "contacted",
    })
  ).data;
  expect(lead.status).toBe("contacted");
  expect(lead.followUpAt).toBeString();
  expect(
    (
      await request(`/api/prospects/${lead.id}/actions`, "POST", {
        version: lead.version,
        action: "contacted",
      })
    ).response.status,
  ).toBe(409);
  lead = (
    await request(`/api/prospects/${lead.id}/actions`, "POST", {
      version: lead.version,
      action: "suppress",
    })
  ).data;
  expect(lead.status).toBe("suppressed");
  expect(lead.followUpAt).toBeNull();
  expect(
    (
      await request(`/api/prospects/${lead.id}/actions`, "POST", {
        version: lead.version,
        action: "approve",
      })
    ).response.status,
  ).toBe(409);
  expect(
    (
      await request("/api/prospects", "POST", {
        name: "Same suppressed host",
        website: "https://example.com.",
        email: "other@example.net",
      })
    ).response.status,
  ).toBe(409);
});

test("Maps JSON import deduplicates domains and preserves source timestamps", async () => {
  const imported = await request<{ added: number; duplicates: number; invalid: unknown[] }>(
    "/api/imports",
    "POST",
    {
      records: [
        {
          name: "First",
          website: "https://import.example",
          url: "https://www.google.com/maps/place/First",
          scrapedAt: "2026-11-01T10:00:00.000Z",
        },
        { name: "Duplicate", website: "https://www.import.example./contact" },
        { name: "No website", website: "" },
      ],
    },
  );
  expect(imported.data).toMatchObject({ added: 1, duplicates: 1 });
  expect(imported.data.invalid).toHaveLength(1);
  const list = await request<{ data: Prospect[] }>("/api/prospects?q=import.example");
  expect(list.data.data[0]!.sourceCapturedAt).toBe("2026-11-01T10:00:00.000Z");
  expect(list.data.data[0]!.sourceUrl).toContain("google.com/maps");
});

test("an invalid Instagram row does not abort the rest of an import", async () => {
  const result = await request<{ added: number; duplicates: number; invalid: { row: number }[] }>(
    "/api/imports",
    "POST",
    {
      records: [
        { name: "Before", website: "before-import.example" },
        { name: "Malformed", website: "bad-import.example", instagram: "not a URL" },
        { name: "After", website: "after-import.example" },
      ],
    },
  );
  expect(result.response.status).toBe(200);
  expect(result.data).toMatchObject({ added: 2, duplicates: 0, invalid: [{ row: 2 }] });
});

test("extension list-only captures remain marked for manual review after import", async () => {
  const result = await request<{ added: number }>("/api/imports", "POST", {
    records: [
      {
        name: "Partial Maps capture",
        website: "partial-capture.example",
        url: "https://www.google.com/maps?cid=123",
        captureStatus: "list_only",
        scrapedAt: "2026-11-05T10:00:00.000Z",
      },
    ],
  });
  expect(result.data.added).toBe(1);
  const list = await request<{ data: Prospect[] }>("/api/prospects?q=partial-capture.example");
  expect(list.data.data[0]?.notes).toContain("detail panel was not matched");
  expect(list.data.data[0]?.verificationStatus).toBe("unverified");
});

async function approvedFixture(service: ReturnType<typeof createSalesService>, domain: string) {
  const campaign = await service.createCampaign({
    name: "Cap fixture",
    audience: "Test fixtures",
    offer: "A concrete service",
    proof: "",
    callToAction: "Discuss?",
  });
  let p = await service.createProspect(
    prospectInput.parse({
      name: domain,
      website: domain,
      email: `hello@${domain}`,
      campaignId: campaign.id,
    }),
    "test",
  );
  p = await service.addEvidence(
    p.id,
    p.version,
    { url: `https://${domain}/`, title: "Manual process", text: "Enquiries are handled by email." },
    "test",
  );
  p = await service.saveDraft(
    p.id,
    p.version,
    {
      score: 1,
      rationale: "A visible enquiry flow",
      evidenceIds: [p.evidence[0]!.id],
      subject: "Enquiries",
      body: "Could a form help?",
    },
    "test",
  );
  return { campaign, prospect: await service.action(p.id, p.version, "approve", "test") };
}

test("concurrent contact logging cannot exceed the shared rolling limit", async () => {
  // One earlier lifecycle test has already logged a contact.
  const service = createSalesService(db, { ...config, DAILY_CONTACT_LIMIT: 2 });
  const [one, two] = await Promise.all([
    approvedFixture(service, "cap-one.example"),
    approvedFixture(service, "cap-two.example"),
  ]);
  const results = await Promise.allSettled(
    [one, two].map(({ prospect: p }) => service.action(p.id, p.version, "contacted", "test")),
  );
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const rejected = results.find((result) => result.status === "rejected");
  expect(rejected?.status === "rejected" && rejected.reason.status).toBe(429);
});

test("changing an offer revokes approval and requires saving against its new revision", async () => {
  const service = createSalesService(db, config);
  const { prospect: p, campaign } = await approvedFixture(service, "offer-change.example");
  await service.updateCampaign(
    campaign.id,
    campaign.version,
    { ...campaign, offer: "A changed service" },
    "test",
  );
  const changed = (await service.detail(p.id)).prospect;
  expect(changed.status).toBe("review");
  expect(changed.approvalVersion).toBeNull();
  await expect(service.action(p.id, p.version, "contacted", "test")).rejects.toThrow();
  await expect(service.action(p.id, changed.version, "approve", "test")).rejects.toThrow(
    "offer changed",
  );
});

test("membership changes revoke API access without restarting the server", async () => {
  const member = (await db.select().from(user).where(eq(user.email, "test@qublox.local")))[0]!;
  await db.update(teamMember).set({ active: false }).where(eq(teamMember.userId, member.id));
  try {
    expect((await request("/api/prospects")).response.status).toBe(403);
  } finally {
    await db.update(teamMember).set({ active: true }).where(eq(teamMember.userId, member.id));
  }
});
test("legacy membership migration enables only requested existing users and never reactivates a revocation", async () => {
  const old = (await db.select().from(user).where(eq(user.email, "new-member@example.com")))[0]!;
  expect(await migrateLegacyTeam(db, [old.email])).toBe(0);
  expect((await db.select().from(teamMember).where(eq(teamMember.userId, old.id)))[0]!.active).toBe(
    false,
  );
  await db.delete(teamMember).where(eq(teamMember.userId, old.id));
  expect(await migrateLegacyTeam(db, ["someone-not-present@example.com"])).toBe(0);
  expect(await migrateLegacyTeam(db, [old.email.toUpperCase()])).toBe(1);
});

test("suppression cancels active research and clears its processing state", async () => {
  const service = createSalesService(db, config);
  let p = await service.createProspect(
    prospectInput.parse({ name: "Queued opt-out", website: "queued-optout.example" }),
    "test",
  );
  p = await service.enqueue(p.id, p.version, "research", "test");
  expect(p.researchStatus).toBe("queued");
  p = await service.action(p.id, p.version, "suppress", "test");
  expect(p.status).toBe("suppressed");
  expect(p.researchStatus).toBe("idle");
  const [job] = await db.select().from(jobs).where(eq(jobs.prospectId, p.id));
  expect(job?.status).toBe("cancelled");
});

test("offline password reset revokes sessions and changes the accepted credential", async () => {
  const config = authConfig;
  const member = {
    name: "Reset fixture",
    email: "reset@qublox.local",
    password: "before-reset-password-123",
  };
  await provisionTeamAccount(config, db, member);
  await expect(provisionTeamAccount(config, db, member)).rejects.toThrow("already exists");
  const login = await auth.api.signInEmail({
    body: { email: member.email, password: member.password },
    asResponse: true,
  });
  const headers = new Headers({
    Cookie: login.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; "),
  });
  expect(await auth.api.getSession({ headers })).not.toBeNull();
  await provisionTeamAccount(config, db, {
    ...member,
    password: "after-reset-password-456",
    reset: true,
  });
  expect(await auth.api.getSession({ headers })).toBeNull();
  await expect(
    auth.api.signInEmail({ body: { email: member.email, password: member.password } }),
  ).rejects.toThrow();
  expect(
    (
      await auth.api.signInEmail({
        body: { email: member.email, password: "after-reset-password-456" },
        asResponse: true,
      })
    ).status,
  ).toBe(200);
});

test("jobs are claimed once, stale leases cannot overwrite, and restarted work recovers", async () => {
  const sales = createSalesService(db, config);
  const lead = await sales.createProspect(
    prospectInput.parse({ name: "Worker test", website: "worker.example" }),
    "Test",
  );
  const queued = await sales.enqueue(lead.id, lead.version, "research", "Test");
  const claimed = await Promise.all([claimJob(db), claimJob(db)]);
  const first = claimed.find(Boolean)!;
  expect(claimed.filter(Boolean)).toHaveLength(1);
  await db
    .update(jobs)
    .set({ lockedAt: new Date(Date.now() - 600_000) })
    .where(eq(jobs.id, first.id));
  const recovered = (await claimJob(db))!;
  expect(recovered.leaseId).not.toBe(first.leaseId);
  const research = {
    summary: "A small business",
    platform: "Unknown",
    emails: ["contact@worker.example"],
    phones: [],
    socials: [],
    evidence: [
      {
        id: crypto.randomUUID(),
        kind: "website" as const,
        url: "https://worker.example/",
        title: "Website",
        text: "A public business description.",
        retrievedAt: new Date().toISOString(),
      },
    ],
    warnings: [],
  };
  await processJob(db, config, first, { research: async () => research });
  expect((await sales.detail(lead.id)).prospect.researchStatus).toBe("running");
  await processJob(db, config, recovered, { research: async () => research });
  const result = (await sales.detail(lead.id)).prospect;
  expect(result.researchStatus).toBe("complete");
  expect(result.email).toBe("contact@worker.example");
  expect(result.verificationStatus).toBe("unverified");
  expect(result.version).toBe(queued.version + 1);
});

test("editing a prospect cancels an in-flight research result", async () => {
  const sales = createSalesService(db, config);
  let lead = await sales.createProspect(
    prospectInput.parse({ name: "Stale test", website: "stale.example" }),
    "Test",
  );
  lead = await sales.enqueue(lead.id, lead.version, "research", "Test");
  const job = (await claimJob(db))!;
  lead = await sales.updateProspect(
    lead.id,
    lead.version,
    prospectInput.parse({ ...lead, name: "Updated business", sourceCapturedAt: null }),
    "Test",
  );
  await processJob(db, config, job, {
    research: async () => ({
      summary: "Old data",
      platform: "Unknown",
      emails: [],
      phones: [],
      socials: [],
      evidence: [],
      warnings: [],
    }),
  });
  const result = (await sales.detail(lead.id)).prospect;
  expect(result.name).toBe("Updated business");
  expect(result.research).toBeNull();
  expect(result.researchStatus).toBe("idle");
});

test("ambiguous AI cost retains a reservation and blocks overspending", async () => {
  await db.delete(llmUsage);
  await db.delete(llmProviderState);
  const p = (await db.select().from(prospects).where(eq(prospects.domain, "worker.example")))[0]!;
  const campaign = {
    name: "Website",
    audience: "Small businesses",
    offer: "Website work",
    proof: "",
    callToAction: "Can I show an example?",
  };
  const fakeFetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                score: 0,
                rationale: "No relevant need",
                evidenceIds: [],
                subject: "",
                body: "",
              }),
            },
          },
        ],
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  const limited = {
    ...config,
    GROQ_API_KEY: "test-key-not-real",
    LLM_MONTHLY_BUDGET_USD: 0.001,
  };
  expect(
    (await generateDraft(db, limited, crypto.randomUUID(), p, campaign, fakeFetch)).score,
  ).toBe(0);
  await db.update(llmUsage).set({ createdAt: new Date(Date.now() - 120000) });
  await expect(
    generateDraft(db, limited, crypto.randomUUID(), p, campaign, fakeFetch),
  ).rejects.toThrow("allowance");
  const usage = await db.select().from(llmUsage);
  expect(usage).toHaveLength(1);
  expect(usage[0]!.state).toBe("reserved");
});

const aiCampaign = {
  name: "Site",
  audience: "Shops",
  offer: "Website",
  proof: "",
  callToAction: "See an example?",
};
const aiProspect = { name: "Shop", channel: "email", evidence: [] };
const aiResponse = () =>
  new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              score: 0,
              rationale: "No signal",
              evidenceIds: [],
              subject: "",
              body: "",
            }),
          },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1000, completion_tokens: 200 },
    }),
  );
test("concurrent AI workers reserve one paced slot without oversending", async () => {
  await db.delete(llmUsage);
  await db.delete(llmProviderState);
  let calls = 0;
  const c = salesConfig({ ...config, GROQ_API_KEY: "fake-key" });
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      generateDraft(db, c, crypto.randomUUID(), aiProspect, aiCampaign, async () => {
        calls++;
        return aiResponse();
      }),
    ),
  );
  expect(calls).toBe(1);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: expect.any(LlmDeferred),
  });
  expect(await db.select().from(llmUsage)).toHaveLength(1);
});
test("provider 429 persists Retry-After and makes no request during cooldown", async () => {
  await db.delete(llmUsage);
  await db.delete(llmProviderState);
  // Exercise the upsert as well as insertion, including non-UTC client timezones.
  await db
    .insert(llmProviderState)
    .values({ provider: "groq", blockedUntil: new Date(Date.now() - 60000) });
  const c = salesConfig({ ...config, GROQ_API_KEY: "fake-key" });
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return new Response("not persisted", { status: 429, headers: { "Retry-After": "3600" } });
  };
  await expect(
    generateDraft(db, c, crypto.randomUUID(), aiProspect, aiCampaign, fetcher),
  ).rejects.toBeInstanceOf(LlmDeferred);
  await expect(
    generateDraft(db, c, crypto.randomUUID(), aiProspect, aiCampaign, fetcher),
  ).rejects.toBeInstanceOf(LlmDeferred);
  expect(calls).toBe(1);
  const [state] = await db.select().from(llmProviderState);
  expect(state!.blockedUntil.getTime()).toBeGreaterThan(Date.now() + 3590000);
  expect(state!.blockedUntil.getTime()).toBeLessThan(Date.now() + 3601000);
  const [attempt] = await db.select().from(llmUsage);
  expect(attempt).toMatchObject({ state: "rejected", costMicros: 0 });
});
test("Gemini uses its own endpoint/key and meters tokens without a Merge fee", async () => {
  await db.delete(llmUsage);
  await db.delete(llmProviderState);
  const c = salesConfig({ ...config, LLM_PROVIDER: "gemini", GEMINI_API_KEY: "fake-gemini-key" });
  const draft = await generateDraft(
    db,
    c,
    crypto.randomUUID(),
    aiProspect,
    aiCampaign,
    async (url, init) => {
      expect(url).toBe(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      );
      expect(init.headers).toMatchObject({ "x-goog-api-key": "fake-gemini-key" });
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      score: 0,
                      rationale: "No signal",
                      evidenceIds: [],
                      subject: "",
                      body: "",
                    }),
                  },
                ],
              },
              finishReason: "STOP",
            },
          ],
          usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 200 },
        }),
      );
    },
  );
  expect(draft.score).toBe(0);
  expect((await db.select().from(llmUsage))[0]).toMatchObject({
    provider: "gemini",
    state: "estimated",
    costMicros: 800,
  });
});
test("local quota deferral requeues a draft without consuming its attempt count", async () => {
  const sales = createSalesService(db, config);
  const offer = await sales.createCampaign(aiCampaign);
  const lead = await sales.createProspect(
    prospectInput.parse({ name: "Paced draft", website: "paced.example", campaignId: offer.id }),
    "Test",
  );
  const [job] = await db
    .insert(jobs)
    .values({
      id: crypto.randomUUID(),
      prospectId: lead.id,
      kind: "draft",
      inputVersion: lead.version,
      status: "running",
      attempts: 1,
      lockedAt: new Date(),
      leaseId: crypto.randomUUID(),
    })
    .returning();
  const until = new Date(Date.now() + 3600000);
  await processJob(db, config, job!, {
    draft: async () => {
      throw new LlmDeferred(until);
    },
  });
  const [saved] = await db.select().from(jobs).where(eq(jobs.id, job!.id));
  expect(saved).toMatchObject({ status: "queued", attempts: 0 });
  expect(saved!.availableAt.getTime()).toBe(until.getTime());
  expect((await sales.detail(lead.id)).prospect.draftStatus).toBe("queued");
  expect(
    (await request(`/api/prospects/${lead.id}/jobs/cancel`, "POST", { version: lead.version + 1 }))
      .response.status,
  ).toBe(409);
  const cancelled = await request(`/api/prospects/${lead.id}/jobs/cancel`, "POST", {
    version: lead.version,
  });
  expect(cancelled.response.status).toBe(200);
  expect(cancelled.data.draftStatus).toBe("idle");
  expect((await db.select().from(jobs).where(eq(jobs.id, job!.id)))[0]!.status).toBe("cancelled");
});

test("quota admission uses the database time after acquiring its lock", async () => {
  await db.delete(llmUsage);
  await db.delete(llmProviderState);
  const holder = await db.$client.connect();
  let pending: Promise<unknown> | undefined;
  try {
    await holder.query("BEGIN");
    await holder.query("select pg_advisory_xact_lock(713220)");
    pending = generateDraft(
      db,
      salesConfig({ ...config, GROQ_API_KEY: "fake-key" }),
      crypto.randomUUID(),
      aiProspect,
      aiCampaign,
      async () => aiResponse(),
    );
    await Bun.sleep(50);
    const released = (await holder.query("select clock_timestamp() as now")).rows[0].now as Date;
    await holder.query("COMMIT");
    await pending;
    const [row] = await db.select().from(llmUsage);
    expect(row!.createdAt.getTime()).toBeGreaterThanOrEqual(released.getTime());
  } finally {
    await holder.query("ROLLBACK");
    holder.release();
    await pending?.catch(() => {});
  }
});

test("definitive provider rejection releases cost but retains request allowance", async () => {
  await db.delete(llmUsage);
  await db.delete(llmProviderState);
  let calls = 0;
  await expect(
    generateDraft(
      db,
      salesConfig({ GROQ_API_KEY: "fake-key" }),
      crypto.randomUUID(),
      aiProspect,
      aiCampaign,
      async () => {
        calls++;
        return new Response("not found", { status: 404 });
      },
    ),
  ).rejects.toThrow("HTTP 404");
  expect(calls).toBe(1);
  const [row] = await db.select().from(llmUsage);
  expect(row).toMatchObject({ state: "rejected", costMicros: 0 });
  expect(row!.quotaTokens).toBeGreaterThan(0);
});

test("teammates connect their own Gmail; the App Password is checked, encrypted and never returned", async () => {
  const bad = await request<{ error: { code: string; message: string } }>(
    "/api/mailboxes/me",
    "PUT",
    { email: "Tester@gmail.com", displayName: "Tess", appPassword: "wrongwrongwrong1" },
  );
  expect(bad.response.status).toBe(422);
  expect(bad.data.error.code).toBe("GMAIL_LOGIN");
  const ok = await request<{ id: string; email: string; mine: boolean }[]>(
    "/api/mailboxes/me",
    "PUT",
    { email: "Tester@gmail.com", displayName: "Tess", appPassword: "abcd efgh ijkl mnop" },
  );
  expect(ok.response.status).toBe(200);
  expect(ok.data).toMatchObject([{ email: "tester@gmail.com", mine: true, displayName: "Tess" }]);
  expect(JSON.stringify(ok.data)).not.toContain("abcdefghijklmnop");
  expect(checkedLogins).toEqual(["tester@gmail.com", "tester@gmail.com"]);
  const stored = await db.$client.query("select secret from mailbox where email=$1", [
    "tester@gmail.com",
  ]);
  expect(stored.rows[0].secret).toStartWith("v1.");
  expect(stored.rows[0].secret).not.toContain("abcdefghijklmnop");
  const settings = await request<{ role: string; mailboxes: unknown[] }>("/api/settings");
  expect(settings.data.role).toBe("member");
  expect(JSON.stringify(settings.data)).not.toContain("abcdefghijklmnop");
  const removed = await request<unknown[]>(`/api/mailboxes/${ok.data[0]!.id}`, "DELETE");
  expect(removed.data).toEqual([]);
  await setTeamRole(db, "test@qublox.local", "admin");
  expect((await request<{ role: string }>("/api/settings")).data.role).toBe("admin");
  await setTeamRole(db, "test@qublox.local", "member");
  expect((await request<{ role: string }>("/api/settings")).data.role).toBe("member");
});

test("listing-only businesses import for WhatsApp with Maps evidence, deduplicated by phone", async () => {
  const { data: offer } = await request<Campaign>("/api/campaigns", "POST", {
    name: "Website build",
    audience: "Local businesses without websites",
    offer: "A simple website with WhatsApp enquiries",
    proof: "",
    callToAction: "Want to see an example?",
  });
  const imported = await request<{ added: number; duplicates: number; invalid: unknown[] }>(
    "/api/imports",
    "POST",
    {
      campaignId: offer.id,
      records: [
        {
          name: "Sharma Sweets",
          website: "",
          phone: "098765 43210",
          address: "Hall Bazaar, Amritsar",
          rating: "4.3",
          reviews: "212",
          url: "https://www.google.com/maps/place/Sharma+Sweets",
        },
        { name: "Sharma Sweets (dup)", website: "", phone: "+91 98765-43210" },
        { name: "Nothing to reach", website: "" },
      ],
    },
  );
  expect(imported.data).toMatchObject({ added: 1, duplicates: 1 });
  expect(imported.data.invalid).toHaveLength(1);
  const list = await request<{ data: Prospect[] }>("/api/prospects?q=98765");
  let shop = list.data.data[0]!;
  expect(shop).toMatchObject({
    domain: null,
    website: "",
    channel: "whatsapp",
    status: "researched",
  });
  expect(shop.evidence[0]).toMatchObject({ kind: "listing" });
  expect(shop.evidence[0]!.text).toContain("No website is listed");
  expect(shop.evidence[0]!.text).toContain("Rating 4.3 from 212 reviews");
  const research = await request<{ error: { code: string } }>(
    `/api/prospects/${shop.id}/jobs`,
    "POST",
    { kind: "research", version: shop.version },
  );
  expect(research.data.error.code).toBe("NO_WEBSITE");
  shop = (
    await request(`/api/prospects/${shop.id}/draft`, "PUT", {
      version: shop.version,
      score: 2,
      rationale: "No website listed; enquiries happen by phone.",
      evidenceIds: [shop.evidence[0]!.id],
      subject: "",
      body: "Hi Sharma Sweets team,\n\n{{sender}} here from Qublox. Would a simple website help?\n\nThanks,\n{{sender}}",
    })
  ).data;
  shop = (
    await request(`/api/prospects/${shop.id}/actions`, "POST", {
      version: shop.version,
      action: "approve",
    })
  ).data;
  expect(shop.status).toBe("approved");
  shop = (
    await request(`/api/prospects/${shop.id}/actions`, "POST", {
      version: shop.version,
      action: "suppress",
    })
  ).data;
  const again = await request("/api/prospects", "POST", {
    name: "Same shop, new name",
    phone: "9876543210",
  });
  expect(again.response.status).toBe(409);
  expect(JSON.stringify(again.data)).toContain("do-not-contact");
});

test("WhatsApp approval needs a number whose country can be determined", async () => {
  const { data: offer } = await request<Campaign>("/api/campaigns", "POST", {
    name: "Bookings",
    audience: "Clinics",
    offer: "Online booking",
    proof: "",
    callToAction: "Open to a quick look?",
  });
  let p = (
    await request("/api/prospects", "POST", {
      name: "UK clinic",
      phone: "0161 496 0000",
      country: "United Kingdom",
      channel: "whatsapp",
      campaignId: offer.id,
    })
  ).data;
  p = (
    await request(`/api/prospects/${p.id}/evidence`, "POST", {
      version: p.version,
      url: "https://example.com/clinic",
      title: "Clinic",
      text: "Appointments are booked by phone only.",
    })
  ).data;
  p = (
    await request(`/api/prospects/${p.id}/draft`, "PUT", {
      version: p.version,
      score: 2,
      rationale: "Phone-only booking",
      evidenceIds: [p.evidence[0]!.id],
      subject: "",
      body: "Hi team, {{sender}} here. Would online booking help?",
    })
  ).data;
  const blocked = await request<{ error: { message: string } }>(
    `/api/prospects/${p.id}/actions`,
    "POST",
    { version: p.version, action: "approve" },
  );
  expect(blocked.response.status).toBe(422);
  expect(blocked.data.error.message).toContain("country code");
});
