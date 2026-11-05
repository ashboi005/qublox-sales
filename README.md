# Qublox Sales

A private sales research workspace for a small team. Built with your selected Better-T-Stack: Next.js, Elysia, Bun, Better Auth, PostgreSQL, Drizzle, and Docker. Application services can run on your VPS and connect to your existing self-hosted PostgreSQL through `DATABASE_URL`.

## What works

- Private team login; accounts are provisioned from the server, with public signup disabled.
- Offers that define the audience, service, real proof, and call to action.
- Collect Maps businesses with the integrated Chrome/Brave extension, then send an editable batch to the app for confirmation. JSON/CSV export is also available. Domains deduplicate across offers; source links and capture times are retained.
- Queue bounded public website research. Collect visible contact details, social links, page excerpts, and platform clues with source URLs and timestamps.
- Optional direct Groq or Gemini scoring and drafting, with shared request/token limits. Drafts cite stored evidence; score zero skips the lead. Manual drafting works without an API key.
- Split-screen evidence and draft review. Edit contacts, switch email/Instagram, save, approve, and regenerate. Edits and offer changes revoke approval; stale writes are rejected.
- Copy an approved message or open it in your email app. Record a manual send, review seven-day follow-up reminders, log replies, close conversations, and suppress businesses.
- Default shared limit of five recorded contacts per rolling 24 hours. Approval never sends anything.

The [build-vs-buy research](docs/research/2026-11-05-build-vs-buy.md) and [implementation specification](docs/spec.md) are preserved.

## Local start

Requires Bun 1.3.10, Node.js 24 for Next.js, and Docker Compose v2.

```bash
bun install --frozen-lockfile --ignore-scripts
bun run env:generate
bun run setup
bun run db:start
bun run db:migrate
bun run team:add --email dev@qublox.local --name 'Local user'
bun run dev
```

The account command prints a strong generated password once. Save it privately. Open [localhost:3001](http://localhost:3001/login) and sign in. `bun run dev` starts the web app, API, and worker together.

Local ports: web **3001**, API **3100**, PostgreSQL **5438** on loopback. The API port avoids the other project already using port 3000 on this machine. Override `PORT` in `apps/server/.env.local` and the corresponding `SERVER_URL` in `apps/web/.env.local` if needed.

`setup` creates ignored local environment files with random secrets and a development email allowlist. It refuses to overwrite existing configuration. If setup reports existing files, use them or edit them deliberately; do not delete a database password while keeping the corresponding PostgreSQL volume.

`ALLOWED_EMAILS` controls who can log into the dashboard, not which inbox sends outreach. Personal Gmail addresses are fine; branded mailboxes are not required. For actual team accounts, put their exact email addresses in `ALLOWED_EMAILS` in `apps/server/.env.local`, restart the API, then run `team:add` for each person. The root `.env` supplies root commands and Docker; app-specific `.env.local` files support running workspaces directly. Root/shell variables take precedence when inherited by child commands. Setup uses the local database URL at port 5438; replace it with your existing database URL for deployment. Keep database/key settings consistent if you launch workspaces directly. Passwords need at least 12 characters. There is no verification-email service or public registration route to manage.

## First session

1. Create one focused offer under **Offers**.
2. Add a prospect or import a JSON array containing up to 100 records below 850 KB. The extension's `name`, `website`, `phone`, `address`, `url`, and `scrapedAt` fields are supported. Invalid rows are reported; duplicates are skipped.
3. Open the prospect and select **Research website**. The worker gathers the home page and up to three relevant pages. You can also add observations manually from a public source.
4. Choose the offer and recipient/channel. Generate a draft when an AI provider is configured, or write one yourself, selecting supporting sources and a signal score.
5. Save, review, and approve the exact saved version. Send from your own mailbox or Instagram. Select **Mark as sent** only after sending.
6. Use **Follow-ups** for reminders. Mark replies or add opt-outs to the do-not-contact list.

## Maps extension

The maintained extension is in [apps/maps-extension](apps/maps-extension/README.md). Load that folder unpacked in Chrome or Brave, then refresh Maps. The sibling scraper project is unchanged; an installation pointing to that older folder will keep running the old code. You can also download the packaged extension under **Import JSON → Use the Qublox Maps extension**. Development and production builds generate that ZIP automatically.

Collect a visible Maps search or a single profile, enter your workspace origin in the popup, and choose **Send to Qublox**. Sign in, review the batch, and confirm. Saved collections survive popup closure and reloads. Hotel layouts, sponsored headings, booking prices/links, same-name branches, and virtualized results have dedicated regression coverage. Unmatched detail panels produce labeled list-only records; places without websites remain exportable and are reported separately during import.

Captured-DOM and simulated Chrome API tests pass; the import preview was checked in a real browser. Native unpacked-extension installation and Chrome permission prompts still need a smoke check in your profile.

## Groq or Gemini

Merge is no longer used. Start with Groq GPT-OSS 20B, or select Gemini Flash-Lite. See [model research, usage calculations and rate-limit behavior](docs/ai.md).

For Docker, set these in root `.env`; for local development, use `apps/server/.env.local`:

```dotenv
LLM_PROVIDER=groq
GROQ_API_KEY=your-key
LLM_MODEL=openai/gpt-oss-20b
LLM_RPM=1
LLM_RPD=20
LLM_TPM=8000
LLM_TPD=100000
LLM_MONTHLY_BUDGET_USD=1
```

For Gemini, set `LLM_PROVIDER=gemini`, `GEMINI_API_KEY=your-key`, and `LLM_MODEL=gemini-2.5-flash-lite`. Restart API and worker. Keys stay on the server. Set allowances at or below your actual account quotas. Queued work waits for capacity; use **Cancel queued work** to write manually during a long cooldown.

Five prospects per working day plus regenerations is about 150 model calls/month. At an illustrative 2,000 input and 800 output tokens per call, paid list-price estimates are about $0.06/month on Groq 20B or $0.08/month on Gemini 2.5 Flash-Lite. Eligible free-tier calls may cost $0. The app estimates at paid prices regardless of account tier and cannot establish your provider bill or guarantee a spending cap. Scraping makes no LLM calls. Provider access and live output quality remain untested without your key; automated tests spend no credits.

## VPS deployment

Your intended public origin is `https://sales.qubloxhq.com`. Use localhost until DNS and HTTPS are ready. See the full [VPS runbook](docs/vps.md). The short version, on the VPS:

```bash
cp .env.example .env
# Edit .env: random secrets, HTTPS origin, team email list; Groq/Gemini optional.
docker compose up -d --build
docker compose exec server bun run team:add --email you@your-domain.com --name 'Your name'
```

Set `DATABASE_URL` to your existing PostgreSQL. Compose runs checked-in migrations, then starts the API, worker, and web app. It does not start a second database. An optional `compose.postgres.yml` override provides a bundled database if needed; see the runbook. Only the web port is published, on `127.0.0.1:3001`. Put your existing HTTPS reverse proxy in front of it. The API has no published host port; keep your existing database private. No VPS deployment has been performed by this build.

## Workflow simulation

```bash
bun run db:start
bun run simulate
```

This exercises private login, import/duplicates/invalid rows, actual public demo-site research, evidence-linked manual drafting, approval invalidation, simulated contact, due follow-up, reply, and suppression through the HTTP API. It uses only local PostgreSQL at port 5438 and resets the dedicated **`qublox_sales_simulation`** database. It never uses the production `DATABASE_URL`, sends no outreach and makes no LLM calls. The ignored report is `artifacts/workflow-simulation.json`. It requires the generated local `POSTGRES_PASSWORD`; it is a local development check, not a command to point at your VPS.

## Checks

```bash
bun run check-types
bun run test
bun run test:integration
bun run build
bun audit
```

Integration tests create and truncate only the isolated `qublox_sales_test` database on local PostgreSQL at port 5438. The runner refuses to target the application database. They cover authentication, private provisioning and resets, cross-origin writes, persistence, import failures, suppression, versioned approval, concurrent daily limits, worker leases and stale results, and AI quotas, cooldowns and cost reservations.

`bun run format` formats source and configuration. Checkpoints and validation evidence are in [docs/verification.md](docs/verification.md).

## Current limits

Research reads public HTML without executing JavaScript. It does not log into social accounts, scrape Instagram, render website screenshots, measure a brand's visual aesthetic, read arbitrary client bundles, or claim a product is a bestseller. Blocked and JavaScript-dependent sites need manual source observations. Platform detection is an indication from public assets, not a complete backend inspection.

Contact discovery is not mailbox verification. Scraped and imported emails remain **unverified**; no enrichment database or verifier is connected. Email/DM delivery is manual, and no inbox-placement claim is made. Niche sourcing uses the integrated Maps extension and manual additions; there is no paid search provider or automated inbox rotation.

This is one shared team workspace. Team members can access all prospects and offers. A multi-client permissions system, automatic sending, reply synchronization, and deliverability monitoring would need another implementation slice.
