import { teamMember } from "@qublox-sales/db/schema/team";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import type { Database } from "@qublox-sales/db";
import { account, session, user } from "@qublox-sales/db/schema/auth";
import { createAuth, type AuthConfig } from "./index";

// Used by the offline team:add command and by the admin-only /team routes.
export async function provisionTeamAccount(
  env: AuthConfig,
  db: Database,
  input: {
    email: string;
    name: string;
    password: string;
    reset?: boolean;
    role?: "admin" | "member";
  },
) {
  const email = z.email().parse(input.email.trim().toLowerCase());
  if (input.password.length < 12 || input.password.length > 128)
    throw new Error("Use a password between 12 and 128 characters.");
  const [existing] = await db.select().from(user).where(eq(user.email, email));
  if (input.reset) {
    if (!existing) throw new Error("No account exists for this email.");
    const password = await hashPassword(input.password);
    await db.transaction(async (tx) => {
      const changed = await tx
        .update(account)
        .set({ password, updatedAt: new Date() })
        .where(and(eq(account.userId, existing.id), eq(account.providerId, "credential")))
        .returning({ id: account.id });
      if (!changed.length) throw new Error("No password account exists for this email.");
      await tx.delete(session).where(eq(session.userId, existing.id));
      await tx
        .insert(teamMember)
        .values({ userId: existing.id, active: true })
        .onConflictDoUpdate({ target: teamMember.userId, set: { active: true } });
    });
    return;
  }
  if (existing)
    throw new Error(
      "An account already exists. Use --reset-password to reset it and revoke its sessions.",
    );
  const provisioner = createAuth(env, db, { provisionAccounts: true });
  await provisioner.api.signUpEmail({
    body: { name: input.name, email, password: input.password },
  });
  // Better Auth deliberately returns synthetic users for some signup failures.
  // Confirm the stored credential, including when two provisioning commands race.
  const [stored] = await db
    .select({ password: account.password, userId: user.id })
    .from(account)
    .innerJoin(user, eq(account.userId, user.id))
    .where(and(eq(user.email, email), eq(account.providerId, "credential")));
  if (
    !stored?.password ||
    !(await verifyPassword({ hash: stored.password, password: input.password }))
  )
    throw new Error(
      "Account creation could not be confirmed. Check whether the account already exists.",
    );
  await db
    .insert(teamMember)
    .values({ userId: stored.userId, active: true, role: input.role || "member" })
    .onConflictDoNothing();
}

export async function setTeamRole(db: Database, email: string, role: "admin" | "member") {
  const [member] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email.trim().toLowerCase()));
  if (!member) throw new Error("No account exists for this email.");
  const changed = await db
    .update(teamMember)
    .set({ role })
    .where(eq(teamMember.userId, member.id))
    .returning({ userId: teamMember.userId });
  if (!changed.length) throw new Error("This account has no team membership. Use team:add first.");
}

export async function disableTeamAccount(db: Database, email: string) {
  return db.transaction(async (tx) => {
    const [member] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email.trim().toLowerCase()))
      .for("update");
    if (!member) throw new Error("No account exists for this email.");
    await tx
      .insert(teamMember)
      .values({ userId: member.id, active: false })
      .onConflictDoUpdate({ target: teamMember.userId, set: { active: false } });
    await tx.delete(session).where(eq(session.userId, member.id));
  });
}

// One-time migration, never a runtime authorization source. Do not reactivate revoked members.
export async function migrateLegacyTeam(db: Database, emails: string[]) {
  const normalized = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!normalized.length) return 0;
  const members = await db
    .select({ userId: user.id })
    .from(user)
    .where(inArray(user.email, normalized));
  if (!members.length) return 0;
  const added = await db
    .insert(teamMember)
    .values(members.map((m) => ({ ...m, active: true })))
    .onConflictDoNothing()
    .returning({ userId: teamMember.userId });
  return added.length;
}
