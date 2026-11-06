import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { mkdirSync } from "node:fs";
import { createDb } from "../packages/db/src";
import { salesConfig } from "../apps/server/src/config";
import { generateDraft } from "../apps/server/src/llm";
import { providerFor } from "../apps/server/src/llm-provider";

// Explicit live check: two bounded calls, fictional public-style evidence, no outreach.
const root = resolve(import.meta.dir, "..");
const local = await Bun.file(resolve(root, ".env")).text();
const privateSettings = parseEnv(local);
const password = local.match(/^POSTGRES_PASSWORD=(.+)$/m)?.[1];
if (!password)
  throw new Error("This check requires the local development database; it never uses the VPS URL.");
const base = `postgresql://postgres:${password}@localhost:5438/`;
const name = "qublox_sales_model_check";
const admin = createDb({ DATABASE_URL: base + "postgres" });
try {
  if (!(await admin.$client.query("select 1 from pg_database where datname=$1", [name])).rowCount)
    await admin.$client.query('create database "qublox_sales_model_check"');
} finally {
  await admin.$client.end();
}
const migrate = Bun.spawn(["bun", "run", "db:migrate"], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: base + name, NODE_ENV: "test" },
  stdout: "inherit",
  stderr: "inherit",
});
if (await migrate.exited) throw new Error("Model-check migrations failed.");
const db = createDb({ DATABASE_URL: base + name });
const id = crypto.randomUUID();
const prospect = {
  name: "Fictional Workshop — model test",
  channel: "email",
  evidence: [
    {
      id,
      kind: "website" as const,
      url: "https://example.com/workshops",
      title: "Fictional model-evaluation fixture",
      text: "TEST FIXTURE, not a real prospect: workshop participants reserve a seat by emailing their name, session date and phone number. Staff manually copy the emails into a spreadsheet. No online registration form is available.",
      retrievedAt: new Date().toISOString(),
    },
  ],
};
const offer = {
  name: "Workshop registration",
  audience: "Workshop organizers",
  offer: "Build a registration form that saves entries into a spreadsheet",
  proof: "No client or outcome claims",
  callToAction: "May I share a small example?",
};
const results = [];
try {
  for (const provider of ["groq", "gemini"] as const) {
    if (process.env.MODEL_CHECK_PROVIDER && process.env.MODEL_CHECK_PROVIDER !== provider) continue;
    const config = salesConfig({
      ...process.env,
      ...privateSettings,
      LLM_PROVIDER: provider,
      LLM_MODEL: process.env.MODEL_CHECK_MODEL || "",
    });
    const selected = providerFor(config);
    if (!selected.key) {
      results.push({ provider, status: "missing key" });
      continue;
    }
    try {
      const draft = await generateDraft(
        db,
        config,
        crypto.randomUUID(),
        prospect,
        offer,
        async (url, init) => {
          const response = await fetch(url, init);
          if (!response.ok) {
            const failure = (await response
              .clone()
              .json()
              .catch(() => null)) as { error?: { status?: string; message?: string } } | null;
            const safe = (failure?.error?.message || "")
              .replaceAll(selected.key, "[redacted]")
              .slice(0, 300);
            console.log(
              JSON.stringify({
                provider,
                http: response.status,
                status: failure?.error?.status,
                detail: safe,
              }),
            );
          }
          return response;
        },
      );
      results.push({ provider, model: selected.model, status: "validated", draft });
      console.log(`${provider}: validated score ${draft.score}; evidence references accepted.`);
    } catch (error) {
      // Never print raw provider responses or credentials.
      const reason =
        error instanceof Error && /^(AI |The monthly)/.test(error.message)
          ? error.message
          : "Request failed; see provider access/quota settings.";
      results.push({
        provider,
        model: selected.model,
        status: "failed",
        reason,
        errorType: error instanceof Error ? error.name : "unknown",
        diagnostic:
          error instanceof Error
            ? error.message.replaceAll(selected.key, "[redacted]").slice(0, 300)
            : "unknown",
      });
      console.log(`${provider}: ${reason}`);
    }
  }
  const rows = await db.$client.query(
    "select provider,model,cost_micros,state from llm_usage order by created_at",
  );
  mkdirSync(resolve(root, "artifacts"), { recursive: true });
  await Bun.write(
    resolve(root, "artifacts/model-check.json"),
    JSON.stringify(
      { at: new Date().toISOString(), fixture: true, results, usage: rows.rows },
      null,
      2,
    ),
  );
  if (results.some((r) => r.status !== "validated")) process.exitCode = 1;
  console.log("Report: artifacts/model-check.json. No emails or DMs sent.");
} finally {
  await db.$client.end();
}
