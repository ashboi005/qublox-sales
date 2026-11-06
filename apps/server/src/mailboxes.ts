import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@qublox-sales/db";
import { user } from "@qublox-sales/db/schema/auth";
import { mailbox } from "@qublox-sales/db/schema/team";
import type { SalesConfig } from "./config";
import { AppError } from "./errors";
import { verifyGmailLogin, type VerifyMailbox } from "./gmail";
import type { Mailbox, MailboxInput } from "./mail-config";
import { secretBox } from "./secret-box";

export type Viewer = { userId: string; name: string; admin: boolean };
export const newMailboxId = () => crypto.randomUUID();

export function createMailboxService(
  db: Database,
  config: SalesConfig,
  verify: VerifyMailbox = verifyGmailLogin,
) {
  const box = () => {
    try {
      return secretBox(config.BETTER_AUTH_SECRET);
    } catch {
      throw new AppError(
        500,
        "MAILBOX_KEY",
        "The server is missing BETTER_AUTH_SECRET, so it cannot store Gmail senders.",
      );
    }
  };
  const visible = (viewer: Viewer) =>
    db
      .select({
        id: mailbox.id,
        email: mailbox.email,
        displayName: mailbox.displayName,
        ownerName: user.name,
        userId: mailbox.userId,
        verifiedAt: mailbox.verifiedAt,
      })
      .from(mailbox)
      .innerJoin(user, eq(user.id, mailbox.userId))
      .where(viewer.admin ? undefined : eq(mailbox.userId, viewer.userId))
      .orderBy(mailbox.displayName);
  return {
    // Senders this viewer may use: an admin sees every connected Gmail, a member only their own.
    async list(viewer: Viewer) {
      const rows = await visible(viewer);
      return rows.map(({ userId, verifiedAt, ...row }) => ({
        ...row,
        mine: userId === viewer.userId,
        verifiedAt: verifiedAt?.toISOString() || null,
      }));
    },
    async connect(viewer: Viewer, input: MailboxInput) {
      const sealed = box().seal(input.appPassword);
      const [taken] = await db
        .select({ userId: mailbox.userId })
        .from(mailbox)
        .where(eq(mailbox.email, input.email));
      if (taken && taken.userId !== viewer.userId)
        throw new AppError(409, "MAILBOX_TAKEN", "Another teammate already connected this Gmail.");
      try {
        await verify(input);
      } catch (error) {
        throw new AppError(
          422,
          "GMAIL_LOGIN",
          error instanceof Error ? error.message : "Gmail login failed.",
        );
      }
      const now = new Date();
      await db
        .insert(mailbox)
        .values({
          id: newMailboxId(),
          userId: viewer.userId,
          email: input.email,
          displayName: input.displayName,
          secret: sealed,
          verifiedAt: now,
        })
        .onConflictDoUpdate({
          target: mailbox.userId,
          set: {
            email: input.email,
            displayName: input.displayName,
            secret: sealed,
            verifiedAt: now,
            updatedAt: now,
          },
        });
      return this.list(viewer);
    },
    async remove(viewer: Viewer, id: string) {
      const [row] = await db.select().from(mailbox).where(eq(mailbox.id, id));
      if (!row) throw new AppError(404, "NOT_FOUND", "This Gmail sender is not connected.");
      if (!viewer.admin && row.userId !== viewer.userId)
        throw new AppError(403, "FORBIDDEN", "Only an admin can disconnect a teammate's Gmail.");
      await db.delete(mailbox).where(eq(mailbox.id, id));
      return this.list(viewer);
    },
    // Checks a requested pool against what this viewer is allowed to send from.
    async assertUsable(viewer: Viewer, ids: string[]) {
      if (!ids.length || new Set(ids).size !== ids.length)
        throw new AppError(422, "SENDER_POOL", "Choose connected Gmail senders for the pool.");
      const rows = await db
        .select({ id: mailbox.id, userId: mailbox.userId })
        .from(mailbox)
        .where(inArray(mailbox.id, ids));
      if (rows.length !== ids.length)
        throw new AppError(422, "SENDER_POOL", "Choose connected Gmail senders for the pool.");
      if (!viewer.admin && rows.some((r) => r.userId !== viewer.userId))
        throw new AppError(
          403,
          "SENDER_POOL",
          "You can send only from your own Gmail. An admin can use the team's senders.",
        );
    },
    // Decrypts senders for the worker. Unreadable secrets are skipped, never guessed.
    async load(ids: string[]): Promise<Mailbox[]> {
      if (!ids.length) return [];
      const rows = await db
        .select()
        .from(mailbox)
        .where(and(inArray(mailbox.id, ids)));
      const opened: Mailbox[] = [];
      for (const row of rows) {
        try {
          opened.push({
            id: row.id,
            email: row.email,
            displayName: row.displayName,
            appPassword: box().open(row.secret),
          });
        } catch {
          console.error(JSON.stringify({ event: "mailbox_unreadable", mailboxId: row.id }));
        }
      }
      return opened;
    },
  };
}
