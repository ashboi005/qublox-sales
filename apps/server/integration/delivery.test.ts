import { beforeAll, beforeEach, afterAll, expect, test } from "bun:test";
import { eq, and, inArray } from "drizzle-orm";
import { createDb } from "@qublox-sales/db";
import { emailOutbox } from "@qublox-sales/db/schema/delivery";
import { activities } from "@qublox-sales/db/schema/sales";
import { prospectInput, manualEvidenceInput } from "@qublox-sales/shared";
import { salesConfig } from "../src/config";
import { createSalesService } from "../src/sales";
import { createDeliveryService } from "../src/deliveries";
import type { SendEmail } from "../src/gmail";
import { secretBox } from "../src/secret-box";
import type { Viewer } from "../src/mailboxes";
import { mailbox } from "@qublox-sales/db/schema/team";
import { user } from "@qublox-sales/db/schema/auth";
if (!process.env.DATABASE_URL?.endsWith("/qublox_sales_test"))
  throw new Error("Delivery tests require isolated test PostgreSQL.");
const db = createDb({ DATABASE_URL: process.env.DATABASE_URL });
const config = salesConfig({
  EMAIL_SENDING_ENABLED: true,
  BETTER_AUTH_SECRET: "integration-test-only-secret-at-least-thirty-two-characters",
  DAILY_CONTACT_LIMIT: 10,
});
// "one" and "two" belong to the admin; "three" belongs to a member.
const admin: Viewer = { userId: "delivery-admin", name: "Admin Person", admin: true };
const member: Viewer = { userId: "delivery-member", name: "Mania Kapoor", admin: false };
const sales = createSalesService(db, config);
let number = 0;
beforeAll(async () => {
  const box = secretBox(config.BETTER_AUTH_SECRET);
  await db.delete(mailbox);
  await db.delete(user).where(inArray(user.id, [admin.userId, member.userId, "delivery-extra"]));
  await db.insert(user).values(
    [admin, member, { userId: "delivery-extra", name: "Extra" }].map((v) => ({
      id: v.userId,
      name: v.name,
      email: `${v.userId}@qublox.local`,
    })),
  );
  await db.insert(mailbox).values(
    [
      { id: "one", userId: admin.userId, email: "one@gmail.com", displayName: "Admin" },
      { id: "two", userId: "delivery-extra", email: "two@gmail.com", displayName: "Ravi" },
      { id: "three", userId: member.userId, email: "three@gmail.com", displayName: "Mania" },
    ].map((m) => ({ ...m, secret: box.seal("abcdefghijklmnop"), verifiedAt: new Date() })),
  );
});
beforeEach(async () => {
  await db.$client.query(
    "TRUNCATE email_outbox, job, activity, suppression, prospect, campaign CASCADE",
  );
});
afterAll(async () => {
  await db.$client.end();
});
async function approved(email?: string) {
  const domain = `mail-${++number}.example`;
  const offer = await sales.createCampaign({
    name: "Fixture",
    audience: "Workshops",
    offer: "Registration form",
    proof: "",
    callToAction: "See an example?",
  });
  let p = await sales.createProspect(
    prospectInput.parse({
      name: domain,
      website: domain,
      email: email || `owner@${domain}`,
      campaignId: offer.id,
    }),
    "test",
  );
  p = await sales.addEvidence(
    p.id,
    p.version,
    manualEvidenceInput.parse({
      version: p.version,
      url: `https://${domain}/workshops`,
      title: "Registration",
      text: "Participants register by emailing details.",
    }),
    "test",
  );
  p = await sales.saveDraft(
    p.id,
    p.version,
    {
      score: 2,
      rationale: "Manual registration",
      evidenceIds: [p.evidence[0]!.id],
      subject: "Registration",
      body: "Could a form help?",
    },
    "test",
  );
  return sales.action(p.id, p.version, "approve", "test");
}
const queue = (p: Awaited<ReturnType<typeof approved>>, senderIds = ["one", "two"]) => ({
  prospects: [{ id: p.id, version: p.version }],
  mode: "now" as const,
  senderIds,
});
test("only current approved emails can enter an enabled queue, with one pending email per prospect", async () => {
  const p = await approved();
  const disabled = createDeliveryService(
    db,
    { ...config, EMAIL_SENDING_ENABLED: false },
    async () => ({ messageId: "never" }),
  );
  await expect(disabled.queue(queue(p), admin)).rejects.toThrow("disabled");
  const service = createDeliveryService(db, config, async () => ({ messageId: "fake" }));
  await expect(service.queue({ ...queue(p), senderIds: ["unknown"] }, admin)).rejects.toThrow(
    "connected",
  );
  const result = await service.queue(queue(p), admin);
  expect(result.queued).toBe(1);
  await expect(service.queue(queue(p), admin)).rejects.toThrow("already queued");
  const edited = await sales.updateProspect(
    p.id,
    p.version,
    prospectInput.parse({ ...p, email: "changed@example.com" }),
    "test",
  );
  expect((await db.select().from(emailOutbox))[0]!.status).toBe("cancelled");
  await expect(service.queue(queue(edited), admin)).rejects.toThrow("approve");
});
test("a reviewed batch is spread through the chosen window and can be expedited with a chosen sender", async () => {
  const a = await approved(),
    b = await approved();
  const service = createDeliveryService(db, config, async () => ({ messageId: "fake" }));
  const start = new Date(Date.now() + 3600000),
    end = new Date(Date.now() + 7200000);
  const result = await service.queue(
    {
      prospects: [a, b].map((p) => ({ id: p.id, version: p.version })),
      mode: "spread",
      senderIds: ["one", "two"],
      startAt: start.toISOString(),
      endAt: end.toISOString(),
    },
    admin,
  );
  expect(result.queued).toBe(2);
  for (const r of result.deliveries) {
    expect(r.scheduledAt.getTime()).toBeGreaterThan(start.getTime());
    expect(r.scheduledAt.getTime()).toBeLessThan(end.getTime());
  }
  await service.change(a.id, a.version, result.deliveries[0]!.id, "now", admin, ["two"]);
  const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.prospectId, a.id));
  expect(row!.senderPool).toEqual(["two"]);
  expect(row!.scheduledAt.getTime()).toBeLessThanOrEqual(Date.now());
  await service.change(a.id, a.version, row!.id, "cancel", admin);
  expect((await db.select().from(emailOutbox).where(eq(emailOutbox.id, row!.id)))[0]!.status).toBe(
    "cancelled",
  );
});
test("concurrent workers dispatch once, and SMTP acceptance records contact with the exact snapshot", async () => {
  const p = await approved();
  let calls = 0;
  const sender: SendEmail = async (account, message) => {
    calls++;
    expect(account.id).toBe("two");
    expect(message.toAddress).toBe(p.email!);
    expect(message.body).toBe(p.draftBody);
    return { messageId: "fixture-message" };
  };
  const one = createDeliveryService(db, config, sender),
    two = createDeliveryService(db, config, sender);
  await one.queue(queue(p, ["two"]), admin);
  await Promise.all([one.dispatchOne(), two.dispatchOne()]);
  expect(calls).toBe(1);
  const detail = await sales.detail(p.id);
  expect(detail.prospect.status).toBe("contacted");
  expect(detail.prospect.followUpAt).toBeInstanceOf(Date);
  expect(detail.deliveries[0]).toMatchObject({
    status: "sent",
    messageId: "fixture-message",
    senderId: "two",
  });
  expect(detail.activities.filter((a) => a.kind === "contacted")).toHaveLength(1);
});
test("daily allowances include in-flight reservations and do not multiply by sender accounts", async () => {
  const limited = { ...config, DAILY_CONTACT_LIMIT: 1 };
  let calls = 0;
  const service = createDeliveryService(db, limited, async () => {
    calls++;
    return { messageId: "fake" };
  });
  const a = await approved(),
    b = await approved();
  await service.queue(queue(a), admin);
  await service.dispatchOne();
  await service.queue(queue(b), admin);
  await service.dispatchOne();
  expect(calls).toBe(1);
  const [waiting] = await db.select().from(emailOutbox).where(eq(emailOutbox.prospectId, b.id));
  expect(waiting!.status).toBe("queued");
  expect(waiting!.scheduledAt.getTime()).toBeGreaterThan(Date.now() + 23 * 3600000);
});
test("ambiguous acceptance is never retried automatically and needs explicit Gmail reconciliation", async () => {
  const p = await approved();
  let calls = 0;
  const service = createDeliveryService(db, config, async () => {
    calls++;
    throw { code: "ETIMEDOUT", command: "CONN" };
  });
  const r = await service.queue(queue(p), admin);
  await service.dispatchOne();
  await service.dispatchOne();
  expect(calls).toBe(1);
  expect((await sales.detail(p.id)).deliveries[0]!.status).toBe("uncertain");
  await expect(service.queue(queue(p), admin)).rejects.toThrow("resolve");
  await expect(
    sales.updateProspect(p.id, p.version, prospectInput.parse(p), "test"),
  ).rejects.toThrow("resolve");
  const resolved = await service.resolve(p.id, p.version, r.deliveries[0]!.id, true, "test");
  expect(resolved.status).toBe("contacted");
  expect(calls).toBe(1);
});
test("disabled sending still recovers stale attempts, without any transport call", async () => {
  const p = await approved();
  const service = createDeliveryService(db, config, async () => ({ messageId: "never" }));
  const r = await service.queue(queue(p), admin);
  await db
    .update(emailOutbox)
    .set({ status: "sending", startedAt: new Date(Date.now() - 180000), senderId: "one" })
    .where(eq(emailOutbox.id, r.deliveries[0]!.id));
  let calls = 0;
  const paused = createDeliveryService(
    db,
    { ...config, EMAIL_SENDING_ENABLED: false },
    async () => {
      calls++;
      return { messageId: "never" };
    },
  );
  await paused.dispatchOne();
  expect(calls).toBe(0);
  expect((await sales.detail(p.id)).deliveries[0]!.status).toBe("uncertain");
  const resolved = await paused.resolve(p.id, p.version, r.deliveries[0]!.id, false, "test");
  expect(resolved.status).toBe("approved");
});
test("in-flight recipient, offer and cross-prospect suppression changes cannot race SMTP", async () => {
  const a = await approved("shared@example.com"),
    b = await approved("shared@example.com");
  let release!: () => void, entered!: () => void;
  const begun = new Promise<void>((r) => (entered = r)),
    hold = new Promise<void>((r) => (release = r));
  const service = createDeliveryService(db, config, async () => {
    entered();
    await hold;
    return { messageId: "fake" };
  });
  await service.queue(queue(a), admin);
  const running = service.dispatchOne();
  await begun;
  try {
    await expect(
      sales.updateProspect(a.id, a.version, prospectInput.parse(a), "test"),
    ).rejects.toThrow("dispatched");
    await expect(sales.action(b.id, b.version, "suppress", "test")).rejects.toThrow("dispatched");
    const offer = (await sales.campaigns()).find((c) => c.id === a.campaignId)!;
    await expect(
      sales.updateCampaign(offer.id, offer.version, { ...offer, offer: "Changed" }, "test"),
    ).rejects.toThrow("dispatched");
  } finally {
    release();
    await running;
  }
});
test("an offer change cancels scheduled snapshots; known SMTP rejection does not mark a contact", async () => {
  const a = await approved();
  const service = createDeliveryService(db, config, async () => {
    throw { responseCode: 550, command: "DATA" };
  });
  await service.queue(queue(a), admin);
  const offer = (await sales.campaigns())[0]!;
  await sales.updateCampaign(offer.id, offer.version, { ...offer, offer: "Changed" }, "test");
  expect((await sales.detail(a.id)).deliveries[0]!.status).toBe("cancelled");
  const b = await approved();
  await service.queue(queue(b), admin);
  await service.dispatchOne();
  expect((await sales.detail(b.id)).deliveries[0]!.status).toBe("failed");
  expect((await sales.detail(b.id)).prospect.status).toBe("approved");
  expect(
    await db
      .select()
      .from(activities)
      .where(and(eq(activities.prospectId, b.id), eq(activities.kind, "contacted"))),
  ).toHaveLength(0);
});

test("SMTP settings never expose App Passwords and rejected attempts use the daily allowance", async () => {
  const settings = await sales.settings(admin);
  expect(settings.mailboxes.map((m) => m.id).sort()).toEqual(["one", "three", "two"]);
  expect(settings.role).toBe("admin");
  const own = await sales.settings(member);
  expect(own.mailboxes).toMatchObject([{ id: "three", mine: true, displayName: "Mania" }]);
  expect(own.role).toBe("member");
  expect(JSON.stringify([settings, own])).not.toContain("abcdefghijklmnop");
  expect(JSON.stringify([settings, own])).not.toContain("v1.");
  const p = await approved();
  const service = createDeliveryService(db, { ...config, DAILY_CONTACT_LIMIT: 1 }, async () => {
    throw { code: "EAUTH" };
  });
  await service.queue(queue(p), admin);
  await service.dispatchOne();
  expect((await sales.overview()).contactedToday).toBe(1);
  const second = await approved();
  await service.queue(queue(second), admin);
  await service.dispatchOne();
  const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.prospectId, second.id));
  expect(row!.status).toBe("queued");
  expect(row!.scheduledAt.getTime()).toBeGreaterThan(Date.now() + 23 * 3600000);
});

test("a worker delayed after claiming cannot open SMTP after its attempt expires", async () => {
  const p = await approved();
  let calls = 0;
  const delayed = createDeliveryService(
    db,
    config,
    async () => {
      calls++;
      return { messageId: "must-not-send" };
    },
    () => Date.now() + 180000,
  );
  await delayed.queue(queue(p), admin);
  await delayed.dispatchOne();
  expect(calls).toBe(0);
  const [row] = await db.select().from(emailOutbox);
  expect(row!.status).toBe("failed");
  expect(row!.lastError).toContain("before opening SMTP");
});

test("a full allowance is postponed strictly past its inclusive rolling-window boundary", async () => {
  const { contactCapacity } = await import("../src/contact-cap");
  const p = await approved();
  const now = new Date();
  await db.insert(activities).values({
    id: crypto.randomUUID(),
    prospectId: p.id,
    kind: "contacted",
    detail: "Boundary fixture",
    actor: "test",
    createdAt: new Date(now.getTime() - 86400000),
  });
  const cap = await contactCapacity(db, 1, now);
  expect(cap.count).toBe(1);
  expect(cap.nextAt.getTime()).toBeGreaterThan(now.getTime());
});

test("members send only from their own Gmail, and recipients see that sender's name", async () => {
  const p = await approved();
  const service = createDeliveryService(db, config, async (account, message) => {
    expect(account).toMatchObject({ id: "three", appPassword: "abcdefghijklmnop" });
    sent.push(message.body);
    return { messageId: "member-send" };
  });
  const sent: string[] = [];
  await expect(service.queue(queue(p, ["one"]), member)).rejects.toThrow("your own Gmail");
  await expect(service.queue(queue(p, ["three", "two"]), member)).rejects.toThrow("your own Gmail");
  await expect(service.queue(queue(p, ["missing"]), admin)).rejects.toThrow("connected");
  const draft = await sales.saveDraft(
    p.id,
    p.version,
    {
      score: 2,
      rationale: "Manual registration",
      evidenceIds: [p.evidence[0]!.id],
      subject: "A note from {{sender}}",
      body: "Hi team,\n\n{{sender}} here from Qublox.\n\nThanks,\n{{sender}}",
    },
    "test",
  );
  const approvedAgain = await sales.action(draft.id, draft.version, "approve", "test");
  await service.queue(queue(approvedAgain, ["three"]), member);
  await service.dispatchOne();
  expect(sent).toEqual(["Hi team,\n\nMania here from Qublox.\n\nThanks,\nMania"]);
  const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.prospectId, p.id));
  expect(row!.body).toContain("{{sender}}");
});
