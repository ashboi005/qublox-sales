import { randomBytes } from "node:crypto";
import { z } from "zod";
import { and, asc, count, eq, ne } from "drizzle-orm";
import type { Database } from "@qublox-sales/db";
import { session, user } from "@qublox-sales/db/schema/auth";
import { mailbox, teamMember } from "@qublox-sales/db/schema/team";
import { provisionTeamAccount } from "@qublox-sales/auth/provision";
import type { AuthConfig } from "@qublox-sales/auth";
import { AppError } from "./errors";
import type { Viewer } from "./mailboxes";

// Team management for admins in the portal: the same operations as the team:* commands.
// Generated passwords are returned once, to the admin who asked, and never stored in clear.

export const newMemberInput = z.object({
  email: z.email().trim().toLowerCase(),
  name: z.string().trim().min(1).max(80),
  role: z.enum(["admin", "member"]).default("member"),
});
export const roleInput = z.object({ role: z.enum(["admin", "member"]) });

const generatePassword = () => randomBytes(18).toString("base64url");

export function teamService(db: Database, authConfig: AuthConfig) {
  const requireAdmin = (viewer: Viewer) => {
    if (!viewer.admin) throw new AppError(403, "ADMIN_ONLY", "Only admins can manage the team.");
  };
  const find = async (userId: string) => {
    const [row] = await db
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
        role: teamMember.role,
        active: teamMember.active,
      })
      .from(user)
      .innerJoin(teamMember, eq(teamMember.userId, user.id))
      .where(eq(user.id, userId));
    if (!row) throw new AppError(404, "NOT_FOUND", "Team member not found.");
    return row;
  };
  const otherActiveAdmins = async (userId: string) => {
    const [row] = await db
      .select({ value: count() })
      .from(teamMember)
      .where(
        and(
          eq(teamMember.role, "admin"),
          eq(teamMember.active, true),
          ne(teamMember.userId, userId),
        ),
      );
    return row?.value || 0;
  };
  return {
    async list(viewer: Viewer) {
      requireAdmin(viewer);
      const rows = await db
        .select({
          id: user.id,
          email: user.email,
          name: user.name,
          role: teamMember.role,
          active: teamMember.active,
          createdAt: teamMember.createdAt,
          gmail: mailbox.email,
        })
        .from(teamMember)
        .innerJoin(user, eq(user.id, teamMember.userId))
        .leftJoin(mailbox, eq(mailbox.userId, user.id))
        .orderBy(asc(user.name));
      return rows.map((r) => ({ ...r, you: r.id === viewer.userId }));
    },
    // New member, or a previously removed one brought back with a fresh password.
    async add(viewer: Viewer, raw: z.input<typeof newMemberInput>) {
      requireAdmin(viewer);
      const input = newMemberInput.parse(raw);
      const password = generatePassword();
      const [existing] = await db
        .select({ id: user.id, active: teamMember.active })
        .from(user)
        .leftJoin(teamMember, eq(teamMember.userId, user.id))
        .where(eq(user.email, input.email));
      if (existing?.active)
        throw new AppError(409, "MEMBER_EXISTS", "This person is already on the team.");
      try {
        await provisionTeamAccount(authConfig, db, {
          ...input,
          password,
          reset: Boolean(existing),
          role: input.role,
        });
      } catch (error) {
        throw new AppError(
          422,
          "MEMBER_NOT_CREATED",
          error instanceof Error ? error.message : "The account could not be created.",
        );
      }
      if (existing)
        await db
          .update(teamMember)
          .set({ role: input.role })
          .where(eq(teamMember.userId, existing.id));
      return { email: input.email, password, reactivated: Boolean(existing) };
    },
    async setRole(viewer: Viewer, userId: string, role: "admin" | "member") {
      requireAdmin(viewer);
      const member = await find(userId);
      if (role === "member" && member.role === "admin" && (await otherActiveAdmins(userId)) === 0)
        throw new AppError(
          409,
          "LAST_ADMIN",
          "Make someone else an admin first; the team needs at least one.",
        );
      await db.update(teamMember).set({ role }).where(eq(teamMember.userId, userId));
      return find(userId);
    },
    async resetPassword(viewer: Viewer, userId: string) {
      requireAdmin(viewer);
      const member = await find(userId);
      const password = generatePassword();
      // Also re-enables membership and signs them out everywhere, like team:add --reset-password.
      await provisionTeamAccount(authConfig, db, {
        email: member.email,
        name: member.name,
        password,
        reset: true,
      });
      return { email: member.email, password };
    },
    // Disables access and signs them out. Their leads and history stay; their Gmail is disconnected.
    async remove(viewer: Viewer, userId: string) {
      requireAdmin(viewer);
      if (userId === viewer.userId)
        throw new AppError(409, "REMOVE_SELF", "You cannot remove yourself. Ask another admin.");
      const member = await find(userId);
      if (member.role === "admin" && (await otherActiveAdmins(userId)) === 0)
        throw new AppError(409, "LAST_ADMIN", "The team needs at least one admin.");
      await db.transaction(async (tx) => {
        await tx.update(teamMember).set({ active: false }).where(eq(teamMember.userId, userId));
        await tx.delete(session).where(eq(session.userId, userId));
        await tx.delete(mailbox).where(eq(mailbox.userId, userId));
      });
      return { removed: member.email };
    },
  };
}
