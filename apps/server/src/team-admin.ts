import { parseArgs } from "node:util";
import { z } from "zod";
import { createDb } from "@qublox-sales/db";
import { disableTeamAccount, migrateLegacyTeam } from "@qublox-sales/auth/provision";
import { ENV } from "./env.server";

const mode = Bun.argv[2];
const { values } = parseArgs({
  args: Bun.argv.slice(3),
  options: { email: { type: "string" }, emails: { type: "string" } },
});
const db = createDb(ENV);
try {
  if (mode === "remove") {
    await disableTeamAccount(db, z.email().parse(values.email));
    console.log("Membership disabled and all sessions revoked. Stored work remains intact.");
  } else if (mode === "migrate") {
    const emails = (values.emails || process.env.ALLOWED_EMAILS || "").split(",");
    console.log(
      `Migrated ${await migrateLegacyTeam(db, emails)} existing members. Runtime access now uses PostgreSQL; remove legacy ALLOWED_EMAILS.`,
    );
  } else
    throw new Error(
      "Use team:remove --email address or team:migrate [--emails comma-separated-addresses].",
    );
} catch (e) {
  console.error(e instanceof Error ? e.message : "Team update failed.");
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
