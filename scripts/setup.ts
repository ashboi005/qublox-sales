import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const secret = randomBytes(32).toString("hex");
const password = randomBytes(20).toString("hex");
const files: Record<string, string> = {
  ".env": `POSTGRES_PASSWORD=${password}\nDATABASE_URL=postgresql://postgres:${password}@localhost:5438/qublox_sales\nAPP_ORIGIN=http://localhost:3001\nBETTER_AUTH_SECRET=${secret}\nLLM_PROVIDER=groq\nGROQ_API_KEY=\nGEMINI_API_KEY=\n# Empty selects the provider default: GPT-OSS 20B or Gemini 2.5 Flash-Lite.\nLLM_MODEL=\n# Conservative app limits; set no higher than your provider console quotas.\nLLM_RPM=1\nLLM_RPD=20\nLLM_TPM=8000\nLLM_TPD=100000\nLLM_MONTHLY_BUDGET_USD=1\nDAILY_CONTACT_LIMIT=5\n`,
  "apps/server/.env.local": `NODE_ENV=development\nBETTER_AUTH_SECRET=${secret}\nBETTER_AUTH_URL=http://localhost:3001\nCORS_ORIGIN=http://localhost:3001\nDATABASE_URL=postgresql://postgres:${password}@localhost:5438/qublox_sales\nLLM_PROVIDER=groq\nGROQ_API_KEY=\nGEMINI_API_KEY=\n# Empty selects the provider default: GPT-OSS 20B or Gemini 2.5 Flash-Lite.\nLLM_MODEL=\n# Conservative app limits; set no higher than your provider console quotas.\nLLM_RPM=1\nLLM_RPD=20\nLLM_TPM=8000\nLLM_TPD=100000\nLLM_MONTHLY_BUDGET_USD=1\nDAILY_CONTACT_LIMIT=5\n`,
  "apps/web/.env.local":
    "NEXT_PUBLIC_SERVER_URL=http://localhost:3001\nSERVER_URL=http://localhost:3100\n",
};
if (Object.keys(files).some((file) => existsSync(resolve(root, file)))) {
  console.log(
    "Configuration already exists; no secrets or files were overwritten. See .env.example and README.md for configuration.",
  );
} else {
  for (const [file, content] of Object.entries(files)) {
    writeFileSync(resolve(root, file), content, { mode: 0o600, flag: "wx" });
  }
  console.log(
    "Created private, ignored local configuration with random secrets. Provision your local account with: bun run team:add --email dev@qublox.local --name 'Local user'.",
  );
}
