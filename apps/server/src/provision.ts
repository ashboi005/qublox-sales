// Offline account provisioning. This process never starts an HTTP listener.
import { parseArgs } from "node:util";
import { randomBytes } from "node:crypto";
import { provisionTeamAccount } from "@qublox-sales/auth/provision";
import { createDb } from "@qublox-sales/db";
import { z } from "zod";
import { ENV } from "./env.server";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    email: { type: "string" },
    name: { type: "string" },
    "password-stdin": { type: "boolean" },
    "reset-password": { type: "boolean" },
    role: { type: "string" },
  },
});
const input = z
  .object({
    email: z.email(),
    name: z.string().trim().min(1).max(100),
    role: z.enum(["admin", "member"]).default("member"),
  })
  .safeParse(values);
if (!input.success) {
  console.error(
    "Usage: bun run team:add --email you@example.com --name 'Your name' [--role admin|member] [--password-stdin] [--reset-password]",
  );
  process.exit(1);
}
const db = createDb(ENV);
try {
  const password = values["password-stdin"]
    ? (await Bun.stdin.text()).replace(/\r?\n$/, "")
    : randomBytes(24).toString("base64url");
  if (password.length < 12 || password.length > 128)
    throw new Error("Use a password between 12 and 128 characters.");
  await provisionTeamAccount(
    {
      BETTER_AUTH_URL: ENV.BETTER_AUTH_URL,
      BETTER_AUTH_SECRET: ENV.BETTER_AUTH_SECRET,
      CORS_ORIGIN: ENV.CORS_ORIGIN,
    },
    db,
    { ...input.data, password, reset: values["reset-password"] },
  );
  console.log(
    `Account ${values["reset-password"] ? "password reset and membership enabled; all prior sessions revoked" : "created"} for ${input.data.email}. Share credentials privately with that teammate.`,
  );
  if (!values["password-stdin"]) console.log(`Generated password (save it now): ${password}`);
} catch (error) {
  // Do not print request bodies or passwords on failure.
  console.error(error instanceof Error ? error.message : "Unable to create the team account.");
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
