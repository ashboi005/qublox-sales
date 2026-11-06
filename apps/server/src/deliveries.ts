import { and, eq, lte, gte, inArray, desc, sql } from "drizzle-orm";
import type { Database } from "@qublox-sales/db";
import { emailOutbox } from "@qublox-sales/db/schema/delivery";
import { prospects, activities } from "@qublox-sales/db/schema/sales";
import type { QueueEmailInput } from "@qublox-sales/shared";
import type { SalesConfig } from "./config";
import { AppError, conflict } from "./errors";
import { assertNotSuppressed, lockProspect, logActivity, newId, type ProspectRow } from "./sales";
import { contactCapacity } from "./contact-cap";
import { scheduleTimes, smtpOutcome } from "./mail-config";
import { gmailSender, type SendEmail } from "./gmail";
import { createMailboxService, type Viewer } from "./mailboxes";
import { renderMessage } from "@qublox-sales/shared";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Row = typeof emailOutbox.$inferSelect;
function assertApproved(p: ProspectRow) {
  if (
    p.status !== "approved" ||
    p.approvalVersion !== p.version ||
    p.channel !== "email" ||
    !p.email ||
    !p.draftSubject ||
    !p.draftBody
  )
    conflict("Review and approve the current email before queueing it.");
  if (/[\r\n]/.test(p.draftSubject))
    throw new AppError(422, "SUBJECT", "Use a single-line email subject.");
}
function sameSnapshot(row: Row, p: ProspectRow) {
  return (
    row.inputVersion === p.version &&
    row.toAddress === p.email &&
    row.subject === p.draftSubject &&
    row.body === p.draftBody
  );
}
async function clock(tx: Tx) {
  const r = await tx.execute<{ now: Date }>(sql`select clock_timestamp() as now`);
  return new Date(r.rows[0]!.now);
}
async function finish(
  tx: Tx,
  row: Row,
  p: ProspectRow,
  now: Date,
  actor: string,
  messageId: string,
) {
  const occurred = row.startedAt || now;
  await tx
    .update(emailOutbox)
    .set({ status: "sent", sentAt: now, messageId, lastError: "" })
    .where(eq(emailOutbox.id, row.id));
  const terminal = ["suppressed", "replied", "meeting", "closed"].includes(p.status);
  const [updated] = await tx
    .update(prospects)
    .set({
      status: terminal ? p.status : "contacted",
      contactedAt: p.contactedAt || occurred,
      followUpAt: terminal ? null : new Date(occurred.getTime() + 7 * 86400000),
      approvalVersion: null,
      version: p.version + 1,
      updatedAt: now,
    })
    .where(eq(prospects.id, p.id))
    .returning();
  await tx.insert(activities).values({
    id: newId(),
    prospectId: p.id,
    kind: "contacted",
    detail: `Gmail accepted the email to ${row.toAddress}${actor === "Email worker" ? "" : "; confirmed manually after checking Gmail"}. Inbox placement is unknown.`,
    actor,
    createdAt: occurred,
  });
  return updated!;
}
export function createDeliveryService(
  db: Database,
  config: SalesConfig,
  send: SendEmail = gmailSender(config.COMPANY_NAME),
  dispatchTime: () => number = Date.now,
) {
  const senders = createMailboxService(db, config);
  const validatePool = async (ids: string[], viewer: Viewer) => {
    if (!config.EMAIL_SENDING_ENABLED)
      throw new AppError(
        422,
        "EMAIL_DISABLED",
        "Gmail sending is disabled on the server. Set EMAIL_SENDING_ENABLED=true when ready.",
      );
    await senders.assertUsable(viewer, ids);
  };
  return {
    async list() {
      const rows = await db
        .select({ delivery: emailOutbox, name: prospects.name, version: prospects.version })
        .from(emailOutbox)
        .innerJoin(prospects, eq(prospects.id, emailOutbox.prospectId))
        .orderBy(desc(emailOutbox.createdAt))
        .limit(100);
      return rows.map((r) => ({ ...r.delivery, prospectName: r.name, currentVersion: r.version }));
    },
    async queue(input: QueueEmailInput, viewer: Viewer) {
      const actor = viewer.name;
      await validatePool(input.senderIds, viewer);
      if (new Set(input.prospects.map((p) => p.id)).size !== input.prospects.length)
        throw new AppError(422, "DUPLICATE_SELECTION", "Select each prospect once.");
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(713219)`);
        const now = await clock(tx);
        const start = input.mode === "now" ? now : new Date(input.startAt || ""),
          end = input.mode === "now" ? now : new Date(input.endAt || "");
        if (
          input.mode === "spread" &&
          (!Number.isFinite(start.getTime()) ||
            !Number.isFinite(end.getTime()) ||
            start.getTime() < now.getTime() - 60000 ||
            end <= start ||
            end.getTime() > now.getTime() + 7 * 86400000)
        )
          throw new AppError(
            422,
            "SEND_WINDOW",
            "Choose a future sending window within the next seven days.",
          );
        const times =
          input.mode === "now"
            ? input.prospects.map(() => now)
            : scheduleTimes(input.prospects.length, start, end);
        const rows = [];
        for (const [i, item] of input.prospects.entries()) {
          const p = await lockProspect(tx, item.id, item.version);
          assertApproved(p);
          await assertNotSuppressed(tx, p);
          if (p.verificationStatus === "invalid")
            throw new AppError(
              422,
              "EMAIL_INVALID",
              `${p.name}: the email failed verification. Correct the address or contact them another way.`,
            );
          const [existing] = await tx
            .select({ id: emailOutbox.id })
            .from(emailOutbox)
            .where(
              and(
                eq(emailOutbox.prospectId, p.id),
                inArray(emailOutbox.status, ["queued", "sending", "uncertain"]),
              ),
            );
          if (existing)
            conflict("An email for this prospect is already queued or awaiting confirmation.");
          const [row] = await tx
            .insert(emailOutbox)
            .values({
              id: newId(),
              prospectId: p.id,
              inputVersion: p.version,
              senderPool: input.senderIds,
              toAddress: p.email!,
              subject: p.draftSubject,
              body: p.draftBody,
              scheduledAt: times[i]!,
            })
            .returning();
          rows.push(row!);
          await logActivity(
            tx,
            p.id,
            "email_queued",
            `Approved email queued for ${times[i]!.toISOString()}. Limits may postpone it.`,
            actor,
          );
        }
        return { queued: rows.length, deliveries: rows };
      });
    },
    async change(
      id: string,
      version: number,
      deliveryId: string,
      action: "cancel" | "now",
      viewer: Viewer,
      senderIds?: string[],
    ) {
      const actor = viewer.name;
      if (action === "now" && senderIds) await validatePool(senderIds, viewer);
      return db.transaction(async (tx) => {
        const p = await lockProspect(tx, id, version);
        const [row] = await tx
          .select()
          .from(emailOutbox)
          .where(and(eq(emailOutbox.id, deliveryId), eq(emailOutbox.prospectId, id)))
          .for("update");
        if (!row || row.status !== "queued")
          conflict("This email is no longer queued. Refresh before changing it.");
        if (action === "now") {
          assertApproved(p);
          if (!sameSnapshot(row, p)) conflict();
          if (!senderIds && !config.EMAIL_SENDING_ENABLED)
            throw new AppError(422, "EMAIL_DISABLED", "Gmail sending is disabled on the server.");
          await tx
            .update(emailOutbox)
            .set({ scheduledAt: await clock(tx), senderPool: senderIds || row.senderPool })
            .where(eq(emailOutbox.id, row.id));
        } else
          await tx
            .update(emailOutbox)
            .set({ status: "cancelled" })
            .where(eq(emailOutbox.id, row.id));
        await logActivity(
          tx,
          id,
          action === "cancel" ? "email_cancelled" : "email_expedited",
          action === "cancel"
            ? "Queued email cancelled."
            : "Email moved to the next available sending slot; limits still apply.",
          actor,
        );
        return p;
      });
    },
    async resolve(
      id: string,
      version: number,
      deliveryId: string,
      delivered: boolean,
      actor: string,
    ) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(713219)`);
        const [p] = await tx.select().from(prospects).where(eq(prospects.id, id)).for("update");
        if (!p || p.version !== version) conflict();
        const [row] = await tx
          .select()
          .from(emailOutbox)
          .where(and(eq(emailOutbox.id, deliveryId), eq(emailOutbox.prospectId, id)))
          .for("update");
        if (!row || row.status !== "uncertain")
          conflict("This email is not awaiting confirmation.");
        if (delivered) return finish(tx, row, p, await clock(tx), actor, row.messageId);
        await tx
          .update(emailOutbox)
          .set({
            status: "failed",
            lastError: "Operator checked Gmail and confirmed this email was not sent.",
          })
          .where(eq(emailOutbox.id, row.id));
        await logActivity(
          tx,
          id,
          "email_resolved",
          "Operator confirmed no send after checking Gmail; manual retry is available.",
          actor,
        );
        return p;
      });
    },
    async dispatchOne() {
      const claimed = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(713219)`);
        const now = await clock(tx);
        await tx
          .update(emailOutbox)
          .set({
            status: "uncertain",
            lastError:
              "Worker stopped before confirmation. Check Gmail Sent before resolving; this email will not retry automatically.",
          })
          .where(
            and(
              eq(emailOutbox.status, "sending"),
              lte(emailOutbox.startedAt, new Date(now.getTime() - 120000)),
            ),
          );
        if (!config.EMAIL_SENDING_ENABLED) return null;
        const [row] = await tx
          .select()
          .from(emailOutbox)
          .where(and(eq(emailOutbox.status, "queued"), lte(emailOutbox.scheduledAt, now)))
          .orderBy(emailOutbox.scheduledAt)
          .limit(1)
          .for("update", { skipLocked: true });
        if (!row) return null;
        const [p] = await tx
          .select()
          .from(prospects)
          .where(eq(prospects.id, row.prospectId))
          .for("update");
        try {
          if (!p) throw new Error("Missing prospect");
          assertApproved(p);
          await assertNotSuppressed(tx, p);
          if (p.verificationStatus === "invalid")
            throw new AppError(
              422,
              "EMAIL_INVALID",
              `${p.name}: the email failed verification. Correct the address or contact them another way.`,
            );
          if (!sameSnapshot(row, p)) conflict();
        } catch {
          await tx
            .update(emailOutbox)
            .set({
              status: "cancelled",
              lastError: "Approval, recipient, message or contact permission changed.",
            })
            .where(eq(emailOutbox.id, row.id));
          return null;
        }
        const pool = await senders.load(row.senderPool);
        if (!pool.length) {
          await tx
            .update(emailOutbox)
            .set({
              status: "failed",
              lastError:
                "None of the selected Gmail senders is connected now. Reconnect one in Settings, then queue again.",
            })
            .where(eq(emailOutbox.id, row.id));
          return null;
        }
        const recent = await tx
          .select({ senderId: emailOutbox.senderId, startedAt: emailOutbox.startedAt })
          .from(emailOutbox)
          .where(gte(emailOutbox.startedAt, new Date(now.getTime() - 86400000)));
        const lastGlobal = Math.max(0, ...recent.map((r) => r.startedAt?.getTime() || 0));
        const ranked = pool
          .map((a) => ({
            account: a,
            last: Math.max(
              0,
              ...recent.filter((r) => r.senderId === a.id).map((r) => r.startedAt?.getTime() || 0),
            ),
          }))
          .sort((a, b) => a.last - b.last || a.account.id.localeCompare(b.account.id));
        const chosen = ranked[0]!;
        const capacity = await contactCapacity(tx, config.DAILY_CONTACT_LIMIT, now);
        const available = Math.max(
          now.getTime(),
          capacity.nextAt.getTime(),
          lastGlobal + config.EMAIL_MIN_INTERVAL_SECONDS * 1000,
          chosen.last + config.EMAIL_ACCOUNT_INTERVAL_SECONDS * 1000,
        );
        if (available > now.getTime()) {
          await tx
            .update(emailOutbox)
            .set({
              scheduledAt: new Date(available),
              lastError: "Waiting for the workspace or Gmail account sending allowance.",
            })
            .where(eq(emailOutbox.id, row.id));
          return null;
        }
        const [started] = await tx
          .update(emailOutbox)
          .set({ status: "sending", startedAt: now, senderId: chosen.account.id, lastError: "" })
          .where(eq(emailOutbox.id, row.id))
          .returning();
        return { row: started!, account: chosen.account };
      });
      if (!claimed) return false;
      const deadlineAt = new Date(claimed.row.startedAt!.getTime() + 45000);
      if (dispatchTime() >= deadlineAt.getTime()) {
        await db
          .update(emailOutbox)
          .set({
            status: "failed",
            lastError: "Attempt expired before opening SMTP. Review before retrying.",
          })
          .where(and(eq(emailOutbox.id, claimed.row.id), eq(emailOutbox.status, "sending")));
        return true;
      }
      let result: { messageId: string };
      try {
        // The stored snapshot keeps {{sender}}; the recipient sees this sender's name.
        result = await send(
          claimed.account,
          {
            ...claimed.row,
            subject: renderMessage(claimed.row.subject, claimed.account.displayName),
            body: renderMessage(claimed.row.body, claimed.account.displayName),
          },
          deadlineAt,
        );
      } catch (error) {
        const status = smtpOutcome(error);
        await db
          .update(emailOutbox)
          .set({
            status,
            lastError:
              status === "uncertain"
                ? "Gmail may have accepted this message. Check Sent before resolving; no automatic retry."
                : "Gmail rejected this attempt before acceptance. Check its connection and recipient before retrying.",
          })
          .where(and(eq(emailOutbox.id, claimed.row.id), eq(emailOutbox.status, "sending")));
        console.error(
          JSON.stringify({ event: "email_attempt_failed", deliveryId: claimed.row.id, status }),
        );
        return true;
      }
      // If persistence fails after SMTP acceptance, leave sending for recovery as uncertain.
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(713219)`);
        const [row] = await tx
          .select()
          .from(emailOutbox)
          .where(eq(emailOutbox.id, claimed.row.id))
          .for("update");
        if (!row || row.status !== "sending") return;
        const [p] = await tx
          .select()
          .from(prospects)
          .where(eq(prospects.id, row.prospectId))
          .for("update");
        await finish(tx, row, p!, await clock(tx), "Email worker", result.messageId);
      });
      console.log(JSON.stringify({ event: "email_accepted", deliveryId: claimed.row.id }));
      return true;
    },
  };
}
