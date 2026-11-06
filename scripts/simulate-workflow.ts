import { resolve } from "node:path";
import { localDatabaseBase } from "./local-db";
import { mkdirSync } from "node:fs";
import assert from "node:assert/strict";
import { createDb } from "../packages/db/src";
import { createAuth } from "../packages/auth/src";
import { provisionTeamAccount } from "../packages/auth/src/provision";
import { createApp } from "../apps/server/src/app";
import { salesConfig } from "../apps/server/src/config";
import { createDeliveryService } from "../apps/server/src/deliveries";
import { claimJob, processJob } from "../apps/server/src/jobs";
import type { Campaign, Prospect } from "../packages/shared/src";

// Local, disposable simulation only. Never reads the production DATABASE_URL.
const root = resolve(import.meta.dir, "..");
const base = await localDatabaseBase();
const database = "qublox_sales_simulation";
const admin = createDb({ DATABASE_URL: `${base}postgres` });
try {
  const found = await admin.$client.query("select 1 from pg_database where datname=$1", [database]);
  if (!found.rowCount) await admin.$client.query('create database "qublox_sales_simulation"');
} finally {
  await admin.$client.end();
}
const child = Bun.spawn(["bun", "run", "db:migrate"], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: `${base}${database}`, NODE_ENV: "test" },
  stdout: "inherit",
  stderr: "inherit",
});
if (await child.exited) throw new Error("Simulation migrations failed.");
const db = createDb({ DATABASE_URL: `${base}${database}` });
let app: ReturnType<typeof createApp> | undefined;
let keep = false;
const report: { step: string; result: string }[] = [];
const record = (step: string, result: string) => {
  report.push({ step, result });
  console.log(`${step}: ${result}`);
};
try {
  await db.$client.query(
    'TRUNCATE "user", campaign, prospect, activity, suppression, job, llm_usage, llm_provider_state, email_outbox CASCADE',
  );
  const origin = "http://127.0.0.1:3303";
  const authConfig = {
    BETTER_AUTH_URL: origin,
    CORS_ORIGIN: origin,
    BETTER_AUTH_SECRET: "local-workflow-simulation-secret-only-123456",
  };
  const config = salesConfig({
    DAILY_CONTACT_LIMIT: 10,
    EMAIL_SENDING_ENABLED: true,
    AUTO_PIPELINE: false,
    BETTER_AUTH_SECRET: authConfig.BETTER_AUTH_SECRET,
  });
  const auth = createAuth(authConfig, db);
  await provisionTeamAccount(authConfig, db, {
    email: "simulation@qublox.local",
    name: "Workflow simulation",
    password: "workflow-simulation-only-123",
    role: "admin",
  });
  // The Gmail login check is stubbed: no SMTP connection is opened in the simulation.
  app = createApp({ db, auth, origin, config, verifyMailbox: async () => {} }).listen({
    hostname: "127.0.0.1",
    port: 3310,
  });
  const endpoint = "http://127.0.0.1:3310/api";
  const signIn = await fetch(`${endpoint}/auth/sign-in/email`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "simulation@qublox.local",
      password: "workflow-simulation-only-123",
    }),
  });
  assert.equal(signIn.status, 200);
  const cookie = signIn.headers
    .getSetCookie()
    .map((s) => s.split(";")[0])
    .join("; ");
  const api = async <T = Prospect>(
    path: string,
    method = "GET",
    body?: unknown,
    expected = 200,
  ) => {
    const r = await fetch(`${endpoint}${path}`, {
      method,
      headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.equal(r.status, expected, `${method} ${path}: ${await r.clone().text()}`);
    return (await r.json()) as T;
  };
  assert.equal((await fetch(`${endpoint}/prospects`)).status, 401);
  record("Private login", "Signed in; anonymous prospects request denied");
  const campaign = await api<Campaign>(
    "/campaigns",
    "POST",
    {
      name: "SIMULATION · Bookshop website review",
      audience: "Demo bookshop",
      offer: "Website and contact-form work",
      proof: "Workflow exercise only; no client claims",
      callToAction: "May I share an example?",
    },
    201,
  );
  const records = [
    {
      name: "SIMULATION · Demo bookshop",
      website: "https://books.toscrape.com",
      email: "simulation@example.invalid",
      url: "https://books.toscrape.com/",
      scrapedAt: new Date().toISOString(),
      notes:
        "WORKFLOW SIMULATION ONLY. No outreach is sent. Public demo website; recipient is fictitious.",
    },
    { name: "Missing website", website: "" },
  ];
  const imported = await api<{ added: number; duplicates: number; invalid: unknown[] }>(
    "/imports",
    "POST",
    { records, campaignId: campaign.id },
  );
  assert.equal(imported.added, 1);
  assert.equal(imported.invalid.length, 1);
  const duplicate = await api<{ duplicates: number }>("/imports", "POST", {
    records: [records[0]],
    campaignId: campaign.id,
  });
  assert.equal(duplicate.duplicates, 1);
  record(
    "Collection import",
    "One valid prospect added, missing website reported, duplicate skipped",
  );
  let lead = (await api<{ data: Prospect[] }>("/prospects?q=books.toscrape.com")).data[0]!;
  assert.equal(lead.verificationStatus, "unverified");
  lead = await api(`/prospects/${lead.id}/jobs`, "POST", {
    kind: "research",
    version: lead.version,
  });
  const job = await claimJob(db);
  assert.equal(job?.prospectId, lead.id);
  await processJob(db, config, job!); // Real HTTP-only research; no LLM dependency.
  lead = (await api<{ prospect: Prospect }>(`/prospects/${lead.id}`)).prospect;
  assert.equal(lead.researchStatus, "complete", lead.lastError);
  assert.ok(lead.evidence.length > 0);
  record(
    "Website research",
    `Real public website researched; ${lead.evidence.length} timestamped evidence items saved`,
  );
  const draft = {
    score: 1,
    rationale: "Simulation uses only a demo website; no real buying intent is asserted.",
    evidenceIds: [lead.evidence[0]!.id],
    subject: "Workflow simulation only",
    body: "This is a test of the review workflow using a public demonstration bookshop. No message will be sent. May I share a website example?",
  };
  lead = await api(`/prospects/${lead.id}/draft`, "PUT", { ...draft, version: lead.version });
  lead = await api(`/prospects/${lead.id}/actions`, "POST", {
    action: "approve",
    version: lead.version,
  });
  assert.equal(lead.status, "approved");
  const stale = lead.version;
  lead = await api(`/prospects/${lead.id}`, "PATCH", {
    ...lead,
    email: "second-simulation@example.invalid",
    version: lead.version,
  });
  assert.equal(lead.approvalVersion, null);
  await api(`/prospects/${lead.id}/actions`, "POST", { action: "contacted", version: stale }, 409);
  lead = await api(`/prospects/${lead.id}/actions`, "POST", {
    action: "approve",
    version: lead.version,
  });
  record(
    "Manual draft and approval",
    "Evidence-linked draft saved; recipient edit revoked approval; stale contact rejected; reapproved",
  );
  lead = await api(`/prospects/${lead.id}/actions`, "POST", {
    action: "contacted",
    version: lead.version,
  });
  assert.ok(lead.followUpAt);
  await db.$client.query("update prospect set follow_up_at=$1 where id=$2", [
    new Date(Date.now() - 60000).toISOString(),
    lead.id,
  ]);
  const due = await api<{ data: Prospect[] }>("/prospects?due=true");
  assert.equal(due.data[0]?.id, lead.id);
  lead = await api(`/prospects/${lead.id}/actions`, "POST", {
    action: "followed_up",
    version: lead.version,
  });
  assert.equal(lead.followUpAt, null);
  lead = await api(`/prospects/${lead.id}/actions`, "POST", {
    action: "replied",
    version: lead.version,
  });
  assert.equal(lead.status, "replied");
  lead = await api(`/prospects/${lead.id}/actions`, "POST", {
    action: "meeting",
    version: lead.version,
  });
  assert.equal(lead.status, "meeting");
  const tracked = await api<{ replied: number; meetings: number }>("/overview");
  assert.equal(tracked.meetings, 1);
  record(
    "Simulated contact, follow-up and lead tracking",
    "Recorded only in simulation DB; found due lead, recorded follow-up, reply and meeting set",
  );
  lead = await api(`/prospects/${lead.id}/actions`, "POST", {
    action: "suppress",
    version: lead.version,
  });
  assert.equal(lead.status, "suppressed");
  await api(
    `/prospects/${lead.id}/actions`,
    "POST",
    { action: "approve", version: lead.version },
    409,
  );
  record("Suppression", "Do-not-contact blocks reapproval and clears reminders");
  let mail = await api<Prospect>(
    "/prospects",
    "POST",
    {
      name: "SIMULATION · Gmail outbox",
      website: "https://mail-simulation.example",
      email: "recipient@example.invalid",
      campaignId: campaign.id,
    },
    201,
  );
  mail = await api(`/prospects/${mail.id}/evidence`, "POST", {
    version: mail.version,
    url: "https://example.com/demo",
    title: "Simulation fixture",
    text: "This is a controlled fixture for testing the outbox; no real prospect is contacted.",
  });
  mail = await api(`/prospects/${mail.id}/draft`, "PUT", {
    ...draft,
    body: `Hi team,\n\n{{sender}} here from Qublox. ${draft.body}\n\nThanks,\n{{sender}}`,
    evidenceIds: [mail.evidence[0]!.id],
    version: mail.version,
  });
  mail = await api(`/prospects/${mail.id}/actions`, "POST", {
    action: "approve",
    version: mail.version,
  });
  const [sender] = await api<{ id: string }[]>("/mailboxes/me", "PUT", {
    email: "simulation@gmail.com",
    displayName: "Simran",
    appPassword: "abcd efgh ijkl mnop",
  });
  record("Gmail sender setup", "Teammate connected their own Gmail; App Password stored encrypted");
  const queued = await api<{ queued: number }>("/deliveries", "POST", {
    prospects: [{ id: mail.id, version: mail.version }],
    senderIds: [sender!.id],
    mode: "now",
  });
  assert.equal(queued.queued, 1);
  let smtpCalls = 0;
  const simulatedDelivery = createDeliveryService(db, config, async (_account, snapshot) => {
    assert.equal(snapshot.toAddress, "recipient@example.invalid");
    assert.ok(snapshot.body.startsWith("Hi team,\n\nSimran here from Qublox."));
    smtpCalls++;
    return { messageId: "simulated-smtp-acceptance" };
  });
  await simulatedDelivery.dispatchOne();
  await simulatedDelivery.dispatchOne();
  assert.equal(smtpCalls, 1);
  mail = (await api<{ prospect: Prospect }>(`/prospects/${mail.id}`)).prospect;
  assert.equal(mail.status, "contacted");
  record(
    "Simulated Gmail delivery",
    "Approved snapshot queued and accepted once by a fake transport; no SMTP connection opened",
  );
  const settings = await api<{ aiConfigured: boolean; provider: string }>("/settings");
  assert.equal(settings.aiConfigured, false);
  assert.equal(settings.provider, "groq");
  assert.equal(Number((await db.$client.query("select count(*) from llm_usage")).rows[0].count), 0);
  record("External usage", "Zero LLM requests; zero emails or DMs sent");
  mkdirSync(resolve(root, "artifacts"), { recursive: true });
  await Bun.write(
    resolve(root, "artifacts/workflow-simulation.json"),
    JSON.stringify(
      { at: new Date().toISOString(), database, prospectId: lead.id, report },
      null,
      2,
    ),
  );
  if (Bun.argv.includes("--serve")) {
    keep = true;
    console.log(
      "Simulation passed. QA API remains on 127.0.0.1:3310 against qublox_sales_simulation only; Ctrl+C stops it.",
    );
    const stop = async () => {
      await app?.stop();
      await db.$client.end();
      process.exit(0);
    };
    process.on("SIGTERM", stop);
    process.on("SIGINT", stop);
  } else console.log("Simulation passed. Results: artifacts/workflow-simulation.json");
} finally {
  if (!keep) {
    await app?.stop();
    await db.$client.end();
  }
}
