import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const secret = randomBytes(32).toString("hex");
const password = randomBytes(20).toString("hex");
const files: Record<string, string> = {
  ".env": `POSTGRES_PASSWORD=${password}\nAPP_ORIGIN=http://localhost:3001\nBETTER_AUTH_SECRET=${secret}\nALLOWED_EMAILS=dev@qublox.local\nMERGE_GATEWAY_API_KEY=\nMERGE_MODEL=\nLLM_MONTHLY_BUDGET_USD=5\nDAILY_CONTACT_LIMIT=5\n`,
  "apps/server/.env.local": `NODE_ENV=development\nBETTER_AUTH_SECRET=${secret}\nBETTER_AUTH_URL=http://localhost:3001\nCORS_ORIGIN=http://localhost:3001\nDATABASE_URL=postgresql://postgres:${password}@localhost:5438/qublox_sales\nALLOWED_EMAILS=dev@qublox.local\nMERGE_GATEWAY_API_KEY=\nMERGE_MODEL=\nLLM_MONTHLY_BUDGET_USD=5\nDAILY_CONTACT_LIMIT=5\n`,
  "apps/web/.env.local":
    "NEXT_PUBLIC_SERVER_URL=http://localhost:3001\nSERVER_URL=http://localhost:3100\n",
};
if (Object.keys(files).some((file) => existsSync(resolve(root, file)))) {
  console.log(
    "Configuration already exists; no secrets or files were overwritten. See .env.example and README.md for configuration.",
  );
} else {
  for (const [file, content] of Object.entries(files))
    await Bun.write(resolve(root, file), content);
  console.log(
    "Created ignored local configuration with random secrets. Local signup email: dev@qublox.local. Choose your own password of at least 12 characters. Add your actual team emails before deployment.",
  );
}
