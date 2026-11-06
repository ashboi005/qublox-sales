import { and, eq } from "drizzle-orm";
import type { Database } from "@qublox-sales/db";
import { teamMember, type TeamRole } from "@qublox-sales/db/schema/team";

export async function teamMembership(
  db: Database,
  userId: string,
): Promise<{ role: TeamRole } | null> {
  const [member] = await db
    .select({ role: teamMember.role })
    .from(teamMember)
    .where(and(eq(teamMember.userId, userId), eq(teamMember.active, true)))
    .limit(1);
  return member || null;
}

export async function isTeamMember(db: Database, userId: string) {
  return Boolean(await teamMembership(db, userId));
}
