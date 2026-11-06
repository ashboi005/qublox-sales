import { resolve } from "node:path";
import { createDb } from "../packages/db/src";

const root = resolve(import.meta.dir, "..");
const config = await Bun.file(resolve(root, ".env")).text();
// The local dev container password; .env may now point DATABASE_URL at a remote server.
const password =
  config.match(/^POSTGRES_PASSWORD=(.+)$/m)?.[1] || process.env.POSTGRES_PASSWORD;
if (!password) throw new Error("Run bun run setup and bun run db:start first.");
const base = `postgresql://postgres:${password}@localhost:5438/`;
const admin = createDb({ DATABASE_URL: `${base}postgres` });
try {
  const result = await admin.$client.query(
    "select 1 from pg_database where datname = 'qublox_sales_test'",
  );
  if (!result.rowCount) await admin.$client.query("create database qublox_sales_test");
} finally {
  await admin.$client.end();
}
const env = { ...process.env, DATABASE_URL: `${base}qublox_sales_test`, NODE_ENV: "test" };
const migration = Bun.spawn(["bun", "run", "db:migrate"], {
  cwd: root,
  env,
  stdout: "inherit",
  stderr: "inherit",
});
if (await migration.exited) process.exit(1);
const tests = Bun.spawn(["bun", "test", "apps/server/integration"], {
  cwd: root,
  env,
  stdout: "inherit",
  stderr: "inherit",
});
process.exit(await tests.exited);
