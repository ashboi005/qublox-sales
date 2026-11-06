import { and, eq } from "drizzle-orm";
import type { Database } from "@qublox-sales/db";
import { teamMember } from "@qublox-sales/db/schema/team";

export async function isTeamMember(db: Database, userId: string) {
  const [member] = await db
    .select({ userId: teamMember.userId })
    .from(teamMember)
    .where(and(eq(teamMember.userId, userId), eq(teamMember.active, true)))
    .limit(1);
  return Boolean(member);
}
