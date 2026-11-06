import { and, eq, gte, inArray } from "drizzle-orm";
import type { Database } from "@qublox-sales/db";
import { activities } from "@qublox-sales/db/schema/sales";
import { emailOutbox } from "@qublox-sales/db/schema/delivery";
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
// Called while holding workspace lock 713219. Failed attempts also consume an allowance.
export async function contactCapacity(db: Database | Tx, limit: number, now = new Date()) {
  const since = new Date(now.getTime() - 86400000);
  const contacts = await db
    .select({ at: activities.createdAt })
    .from(activities)
    .where(and(eq(activities.kind, "contacted"), gte(activities.createdAt, since)));
  const attempts = await db
    .select({ at: emailOutbox.startedAt })
    .from(emailOutbox)
    .where(
      and(
        inArray(emailOutbox.status, ["sending", "uncertain", "failed"]),
        gte(emailOutbox.startedAt, since),
      ),
    );
  const times = [...contacts, ...attempts]
    .map((r) => r.at?.getTime())
    .filter((n): n is number => n !== undefined)
    .sort((a, b) => a - b);
  return {
    count: times.length,
    nextAt: times.length >= limit ? new Date(times[times.length - limit]! + 86400001) : now,
  };
}
