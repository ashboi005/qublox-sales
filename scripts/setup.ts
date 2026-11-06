import { existsSync, symlinkSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

// One root .env for everything; apps/server/.env links to it. The web app needs none.
const root = resolve(import.meta.dir, "..");
const secret = randomBytes(32).toString("hex");
const password = randomBytes(20).toString("hex");
const local = `postgresql://postgres:${password}@localhost:5438/qublox_sales`;
const env = `# The one environment file for local development, migrations, team commands and Coolify.

# Database. Point DATABASE_URL at your VPS when ready; tests always use LOCAL_DATABASE_URL.
POSTGRES_PASSWORD=${password}
DATABASE_URL=${local}
LOCAL_DATABASE_URL=${local}

# Auth and site
BETTER_AUTH_SECRET=${secret}
APP_ORIGIN=http://localhost:3001

# Local development only (API on PORT, site on localhost:3001). Docker/Coolify sets these itself.
BETTER_AUTH_URL=http://localhost:3001
CORS_ORIGIN=http://localhost:3001
PORT=3100

# AI drafting: with both keys, Groq and Gemini take turns (docs/ai.md)
LLM_PROVIDER=groq
GROQ_API_KEY=
GEMINI_API_KEY=
LLM_MODEL=
LLM_ROTATE=true
LLM_MONTHLY_BUDGET_USD=1

# Finding leads (docs/lead-search.md)
GOOGLE_PLACES_API_KEY=
PLACES_MONTHLY_REQUEST_LIMIT=900

# Research tools (docs/research-tools.md)
PAGESPEED_API_KEY=
FIRECRAWL_API_KEY=
REOON_API_KEY=

# Pipeline and sending
AUTO_PIPELINE=true
DAILY_CONTACT_LIMIT=10
EMAIL_SENDING_ENABLED=false
COMPANY_NAME=Qublox
EMAIL_MIN_INTERVAL_SECONDS=120
EMAIL_ACCOUNT_INTERVAL_SECONDS=600
`;
const path = resolve(root, ".env");
if (existsSync(path)) {
  console.log("A .env already exists; nothing was overwritten. See .env.example and README.md.");
} else {
  writeFileSync(path, env, { mode: 0o600, flag: "wx" });
  console.log(
    "Created a private .env with random secrets. Provision your local account with: bun run team:add --email dev@qublox.local --name 'Local user' --role admin.",
  );
}
const serverLink = resolve(root, "apps/server/.env");
if (!existsSync(serverLink)) symlinkSync("../../.env", serverLink);
