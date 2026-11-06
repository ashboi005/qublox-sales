import { resolve } from "node:path";
import { parseEnv } from "node:util";

// Test, simulation and model-check scripts only ever use a local PostgreSQL.
// They take the first localhost DATABASE_URL from LOCAL_DATABASE_URL, root .env or
// apps/server/.env.local, then swap in their own disposable database name.
// A remote URL (your VPS) is never used, even when it is the root .env value.
export async function localDatabaseBase() {
  const root = resolve(import.meta.dir, "..");
  const read = async (path: string) => {
    const file = Bun.file(resolve(root, path));
    return (await file.exists()) ? parseEnv(await file.text()).DATABASE_URL : undefined;
  };
  const candidates = [
    process.env.LOCAL_DATABASE_URL,
    await read(".env"),
    await read("apps/server/.env.local"),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const url = new URL(candidate);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) continue;
    url.pathname = "/";
    url.search = "";
    return url.toString();
  }
  throw new Error(
    "No local PostgreSQL URL found. Run bun run db:start and keep a localhost DATABASE_URL in apps/server/.env.local, or set LOCAL_DATABASE_URL. Remote databases are never used here.",
  );
}
