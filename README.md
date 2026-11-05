# Qublox Sales

A private sales research workspace for a small team. Built with your selected Better-T-Stack: Next.js, Elysia, Bun, Better Auth, PostgreSQL, Drizzle, and Docker. PostgreSQL and all application services can run on your VPS.

## What works

- Private team login; accounts are provisioned from the server, with public signup disabled.
- Offers that define the audience, service, real proof, and call to action.
- Add business websites or import JSON from the existing Google Maps extension. Domains deduplicate across offers; source links and capture times are retained.
- Queue bounded public website research. Collect visible contact details, social links, page excerpts, and platform clues with source URLs and timestamps.
- Optional Merge Gateway scoring and drafting, using your own credits. Drafts cite stored evidence; score zero skips the lead. Manual drafting works without an API key.
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

For actual team accounts, put their exact email addresses in `ALLOWED_EMAILS` in `apps/server/.env.local`, restart the API, then run `team:add` for each person. The root `.env` is for Docker; development reads the app-specific files. Passwords need at least 12 characters. There is no verification-email service or public registration route to manage.

## First session

1. Create one focused offer under **Offers**.
2. Add a prospect or import a JSON array containing up to 100 records below 850 KB. The extension's `name`, `website`, `phone`, `address`, `url`, and `scrapedAt` fields are supported. Invalid rows are reported; duplicates are skipped.
3. Open the prospect and select **Research website**. The worker gathers the home page and up to three relevant pages. You can also add observations manually from a public source.
4. Choose the offer and recipient/channel. Generate a draft when Gateway is configured, or write one yourself, selecting supporting sources and a signal score.
5. Save, review, and approve the exact saved version. Send from your own mailbox or Instagram. Select **Mark as sent** only after sending.
6. Use **Follow-ups** for reminders. Mark replies or add opt-outs to the do-not-contact list.

## Merge Gateway

No new service purchase is required. In development, set these in `apps/server/.env.local`; for Docker, set them in the root `.env`:

```dotenv
MERGE_GATEWAY_API_KEY=your-existing-gateway-key
MERGE_MODEL=exact-model-id-from-your-gateway-catalog
LLM_MONTHLY_BUDGET_USD=5
```

Use a cheap text model accessible to your key. The adapter calls the fixed [Merge OpenAI-compatible endpoint](https://docs.merge.dev/merge-gateway/agent-quickstart), caps source text and output tokens, and provides no model tools. It records returned model cost plus the Merge fee. If a price is missing or a request has an ambiguous outcome, a $0.05 reservation is held. Draft requests are not automatically retried after failures.

The local monthly limit is an admission check, not a hard billing cap: an individual request could cost more than its reservation. Set a hard budget on the Gateway key/project as well. Your $10 credit is not assumed to reset on a specific date; the app's own ledger uses UTC calendar months. See [Merge's pricing and budget documentation](https://docs.merge.dev/merge-gateway/cost/pricing).

Keys never go to the browser. Only the prospect evidence and your offer are sent to the model. Live model generation remains untested until you supply a key and accessible model ID; repeatable tests use a stub and spend no credits.

## VPS deployment

See the full [VPS runbook](docs/vps.md). The short version, on the VPS:

```bash
cp .env.example .env
# Edit .env: random secrets, HTTPS origin, team email list; Gateway optional.
docker compose up -d --build
docker compose exec server bun run team:add --email you@your-domain.com --name 'Your name'
```

Compose starts PostgreSQL, runs checked-in migrations, then starts the API, worker, and web app. Only the web port is published, on `127.0.0.1:3001`. Put your existing HTTPS reverse proxy in front of it. PostgreSQL and the API have no published host ports. No VPS deployment has been performed by this build.

## Checks

```bash
bun run check-types
bun run test
bun run test:integration
bun run build
bun audit
```

Integration tests create and truncate only the isolated `qublox_sales_test` database on local PostgreSQL at port 5438. The runner refuses to target the application database. They cover authentication, private provisioning and resets, cross-origin writes, persistence, import failures, suppression, versioned approval, concurrent daily limits, worker leases and stale results, and Gateway reservations.

`bun run format` formats source and configuration. Checkpoints and validation evidence are in [docs/verification.md](docs/verification.md).

## Current limits

Research reads public HTML without executing JavaScript. It does not log into social accounts, scrape Instagram, render website screenshots, measure a brand's visual aesthetic, read arbitrary client bundles, or claim a product is a bestseller. Blocked and JavaScript-dependent sites need manual source observations. Platform detection is an indication from public assets, not a complete backend inspection.

Contact discovery is not mailbox verification. Scraped and imported emails remain **unverified**; no enrichment database or verifier is connected. Email/DM delivery is manual, and no inbox-placement claim is made. Niche sourcing currently uses your existing Maps extension and manual additions; there is no paid search provider or automated inbox rotation.

This is one shared team workspace. Team members can access all prospects and offers. A multi-client permissions system, automatic sending, reply synchronization, and deliverability monitoring would need another implementation slice.
