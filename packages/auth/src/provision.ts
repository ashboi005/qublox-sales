import { and, eq } from "drizzle-orm";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import type { Database } from "@qublox-sales/db";
import { account, session, user } from "@qublox-sales/db/schema/auth";
import { allowedEmails, isTeamMember, createAuth, type AuthConfig } from "./index";

// Invoked by the offline administrator command, never by an HTTP route.
export async function provisionTeamAccount(
  env: AuthConfig,
  db: Database,
  input: { email: string; name: string; password: string; reset?: boolean },
) {
  const email = input.email.trim().toLowerCase();
  if (!isTeamMember(email, allowedEmails(env.ALLOWED_EMAILS)))
    throw new Error("This email is not on the team access list.");
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
    .select({ password: account.password })
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
}
