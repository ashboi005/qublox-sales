import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { createDb } from "@qublox-sales/db";
import { createAuth } from "@qublox-sales/auth";
import { createApp } from "../src/app";
import type { Campaign, Prospect } from "@qublox-sales/shared";
import { createSalesService } from "../src/sales";
import { claimJob, processJob } from "../src/jobs";
import { generateDraft } from "../src/gateway";
import { jobs, llmUsage, prospects } from "@qublox-sales/db/schema/sales";
import { eq } from "drizzle-orm";
import { prospectInput } from "@qublox-sales/shared";

if (!process.env.DATABASE_URL?.endsWith("/qublox_sales_test")) throw new Error("Integration tests require the isolated qublox_sales_test database.");
const db = createDb({ DATABASE_URL: process.env.DATABASE_URL });
const origin = "http://localhost:3001";
const config = { ALLOWED_EMAILS: "test@qublox.local", MERGE_GATEWAY_API_KEY: "", MERGE_MODEL: "", LLM_MONTHLY_BUDGET_USD: 5, DAILY_CONTACT_LIMIT: 1 };
const auth = createAuth({ BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: "integration-test-only-secret-at-least-thirty-two-characters", CORS_ORIGIN: origin, ALLOWED_EMAILS: config.ALLOWED_EMAILS }, db);
const app = createApp({ db, auth, origin, config });
let cookie = "";
async function request<T = Prospect>(path: string, method = "GET", body?: unknown, options: { anonymous?: boolean; foreignOrigin?: boolean } = {}) {
  const headers: Record<string, string> = { Origin: options.foreignOrigin ? "https://attacker.example" : origin };
  if (!options.anonymous) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await app.handle(new Request(`${origin}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
  return { response, data: await response.json() as T };
}

beforeAll(async () => {
  await db.$client.query('TRUNCATE "user", campaign, prospect, activity, suppression, job, llm_usage CASCADE');
  const response = await app.handle(new Request(`${origin}/api/auth/sign-up/email`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Qublox test", email: "test@qublox.local", password: "local-test-password-123" }) }));
  expect(response.status).toBe(200);
  cookie = response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  expect(cookie).toContain("session_token");
});
afterAll(async () => { await db.$client.end(); });

describe("private workspace", () => {
  test("anonymous users cannot read prospect data", async () => {
    expect((await request("/api/prospects", "GET", undefined, { anonymous: true })).response.status).toBe(401);
  });
  test("unlisted email cannot create an account", async () => {
    const result = await request("/api/auth/sign-up/email", "POST", { name: "Stranger", email: "stranger@example.com", password: "long-test-password-123" }, { anonymous: true });
    expect(result.response.status).toBe(403);
  });
  test("foreign-origin mutations are rejected", async () => {
    expect((await request("/api/campaigns", "POST", {}, { foreignOrigin: true })).response.status).toBe(403);
  });
});

test("campaign → evidence → approval → contact, with stale edits and suppression blocked", async () => {
  const { data: campaign } = await request<Campaign>("/api/campaigns", "POST", { name: "Enquiry flow", audience: "Small workshops", offer: "A registration form", proof: "", callToAction: "Can I show an example?" });
  expect(campaign.id).toBeString();
  let { data: lead } = await request("/api/prospects", "POST", { name: "Workshop", website: "https://example.com", email: "owner@example.com", campaignId: campaign.id });
  expect(lead.verificationStatus).toBe("unverified");
  const evidence = await request(`/api/prospects/${lead.id}/evidence`, "POST", { version: lead.version, url: "https://example.com/events", title: "Registration", text: "Email us your registration details." });
  lead = evidence.data;
  const saved = await request(`/api/prospects/${lead.id}/draft`, "PUT", { version: lead.version, score: 2, rationale: "A public manual registration flow", evidenceIds: [lead.evidence[0]!.id], subject: "Workshop registrations", body: "Could a registration form help?" });
  lead = saved.data;
  lead = (await request(`/api/prospects/${lead.id}/actions`, "POST", { version: lead.version, action: "approve" })).data;
  expect(lead.status).toBe("approved");
  expect(lead.approvalVersion).toBe(lead.version);
  const stale = lead.version;
  lead = (await request(`/api/prospects/${lead.id}`, "PATCH", { ...lead, email: "new@example.com", version: lead.version })).data;
  expect(lead.status).toBe("review");
  expect(lead.approvalVersion).toBeNull();
  expect((await request(`/api/prospects/${lead.id}/actions`, "POST", { version: stale, action: "contacted" })).response.status).toBe(409);
  lead = (await request(`/api/prospects/${lead.id}/actions`, "POST", { version: lead.version, action: "approve" })).data;
  lead = (await request(`/api/prospects/${lead.id}/actions`, "POST", { version: lead.version, action: "contacted" })).data;
  expect(lead.status).toBe("contacted");
  expect(lead.followUpAt).toBeString();
  expect((await request(`/api/prospects/${lead.id}/actions`, "POST", { version: lead.version, action: "contacted" })).response.status).toBe(409);
  lead = (await request(`/api/prospects/${lead.id}/actions`, "POST", { version: lead.version, action: "suppress" })).data;
  expect(lead.status).toBe("suppressed");
  expect(lead.followUpAt).toBeNull();
  expect((await request(`/api/prospects/${lead.id}/actions`, "POST", { version: lead.version, action: "approve" })).response.status).toBe(409);
});

test("Maps JSON import deduplicates domains and preserves source timestamps", async () => {
  const imported = await request<{ added: number; duplicates: number; invalid: unknown[] }>("/api/imports", "POST", { records: [
    { name: "First", website: "https://import.example", url: "https://www.google.com/maps/place/First", scrapedAt: "2026-11-01T10:00:00.000Z" },
    { name: "Duplicate", website: "https://www.import.example/contact" },
    { name: "No website", website: "" },
  ] });
  expect(imported.data).toMatchObject({ added: 1, duplicates: 1 });
  expect(imported.data.invalid).toHaveLength(1);
  const list = await request<{ data: Prospect[] }>("/api/prospects?q=import.example");
  expect(list.data.data[0]!.sourceCapturedAt).toBe("2026-11-01T10:00:00.000Z");
  expect(list.data.data[0]!.sourceUrl).toContain("google.com/maps");
});

test("a removed member cannot use an existing session", async () => {
  const restricted = createApp({ db, auth, origin, config: { ...config, ALLOWED_EMAILS: "someone-else@example.com" } });
  const response = await restricted.handle(new Request(`${origin}/api/prospects`, { headers: { Cookie: cookie } }));
  expect(response.status).toBe(403);
});

test("jobs are claimed once, stale leases cannot overwrite, and restarted work recovers", async () => {
  const sales = createSalesService(db, config);
  const lead = await sales.createProspect(prospectInput.parse({ name: "Worker test", website: "worker.example" }), "Test");
  const queued = await sales.enqueue(lead.id, lead.version, "research", "Test");
  const claimed = await Promise.all([claimJob(db), claimJob(db)]);
  const first = claimed.find(Boolean)!;
  expect(claimed.filter(Boolean)).toHaveLength(1);
  await db.update(jobs).set({ lockedAt: new Date(Date.now() - 600_000) }).where(eq(jobs.id, first.id));
  const recovered = (await claimJob(db))!;
  expect(recovered.leaseId).not.toBe(first.leaseId);
  const research = { summary: "A small business", platform: "Unknown", emails: ["contact@worker.example"], phones: [], socials: [], evidence: [{ id: crypto.randomUUID(), kind: "website" as const, url: "https://worker.example/", title: "Website", text: "A public business description.", retrievedAt: new Date().toISOString() }], warnings: [] };
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
  let lead = await sales.createProspect(prospectInput.parse({ name: "Stale test", website: "stale.example" }), "Test");
  lead = await sales.enqueue(lead.id, lead.version, "research", "Test");
  const job = (await claimJob(db))!;
  lead = await sales.updateProspect(lead.id, lead.version, prospectInput.parse({ ...lead, name: "Updated business", sourceCapturedAt: null }), "Test");
  await processJob(db, config, job, { research: async () => ({ summary: "Old data", platform: "Unknown", emails: [], phones: [], socials: [], evidence: [], warnings: [] }) });
  const result = (await sales.detail(lead.id)).prospect;
  expect(result.name).toBe("Updated business");
  expect(result.research).toBeNull();
  expect(result.researchStatus).toBe("idle");
});

test("ambiguous Gateway cost retains a reservation and blocks overspending", async () => {
  await db.delete(llmUsage);
  const p = (await db.select().from(prospects).where(eq(prospects.domain, "worker.example")))[0]!;
  const campaign = { name: "Website", audience: "Small businesses", offer: "Website work", proof: "", callToAction: "Can I show an example?" };
  const fakeFetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ score: 0, rationale: "No relevant need", evidenceIds: [], subject: "", body: "" }) } }] }), { headers: { "Content-Type": "application/json" } });
  const limited = { ...config, MERGE_GATEWAY_API_KEY: "test-key-not-real", MERGE_MODEL: "test/model", LLM_MONTHLY_BUDGET_USD: 0.05 };
  expect((await generateDraft(db, limited, crypto.randomUUID(), p, campaign, fakeFetch)).score).toBe(0);
  await expect(generateDraft(db, limited, crypto.randomUUID(), p, campaign, fakeFetch)).rejects.toThrow("allowance");
  const usage = await db.select().from(llmUsage);
  expect(usage).toHaveLength(1);
  expect(usage[0]!.state).toBe("reserved");
});
