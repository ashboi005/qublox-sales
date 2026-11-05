# VPS runbook

## Topology

```mermaid
flowchart LR
  Browser -->|HTTPS| Proxy[Your reverse proxy]
  Proxy -->|127.0.0.1:3001| Web[Next.js]
  Web -->|internal network| API[Elysia + Better Auth]
  API --> PG[(PostgreSQL)]
  Worker[Research / drafting worker] --> PG
  Worker -->|public addresses only| Sites[Prospect websites]
  Worker -->|optional key| Gateway[Merge Gateway]
  Migrate[One-shot migrations] --> PG
```

The web container proxies a fixed API upstream at runtime. Browser requests and auth cookies stay on your public HTTPS origin. The API and PostgreSQL do not publish host ports. Images run as the unprivileged `node` or `bun` user. The existing Docker network supplies service discovery; Redis is not needed.

## Prepare and start

Install Docker Engine with Compose v2 on your VPS. A small VPS can run the pilot, but building Next.js needs more memory than serving it; allow roughly 2 GB or more for the build, or build the images elsewhere for the VPS architecture. This is an operating estimate, not a measured capacity guarantee.

1. Clone/copy the repository to a private directory. Do not copy development `.env.local` files or use the development database as production.
2. Copy `.env.example` to `.env` and restrict it to the deployment user (`chmod 600 .env`).
3. Generate separate values for `POSTGRES_PASSWORD` and `BETTER_AUTH_SECRET`, for example with `openssl rand -hex 24` and `openssl rand -hex 32`. Use URL-safe hex for the database password because it appears inside a connection URL. Replace all placeholders.
4. Set `APP_ORIGIN=https://sales.your-domain.com` with no trailing slash or path. Set `ALLOWED_EMAILS` to the exact team email addresses. Leave Gateway fields empty for manual drafting. Keep `DAILY_CONTACT_LIMIT=5` initially.
5. Point that hostname to your VPS and configure HTTPS using your existing host reverse proxy. [deploy/Caddyfile.example](../deploy/Caddyfile.example) is a host-installed Caddy example. If your proxy is itself containerized, configure its network/address deliberately; its `127.0.0.1` is not the Docker host.
6. Start and inspect:

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps -a
docker compose logs --tail=100 migrate server worker web
```

`migrate` should exit with code 0. API/web should become healthy. Worker should log that it started. If a migration fails, dependent application services do not start. Fix the failure before continuing. No production `db:push` is needed.

Create each team account from the server:

```bash
docker compose exec server bun run team:add --email you@your-domain.com --name 'Your name'
```

The command generates a password and displays it once in your terminal. Share it with that teammate privately. Public HTTP signup stays disabled. To supply your own password without putting it in process arguments or shell history, pass `--password-stdin` and provide the password on standard input through your preferred secure terminal/password-manager workflow.

Visit the public HTTPS URL and sign in. Create a test offer and business; run one research job. Confirm the evidence appears and approval does not send anything. Check the browser cookie is Secure and HttpOnly. Development uses HTTP cookies only on the local configured origin.

## Team changes and recovery

Add/remove addresses in root `.env`, then recreate both application processes to load the new list:

```bash
docker compose up -d --force-recreate server worker
```

Removing an address immediately blocks workspace API access after recreation, including existing sessions. An administrator can reset an existing account's password and revoke all its stored sessions:

```bash
docker compose exec server bun run team:add --email you@your-domain.com --name 'Your name' --reset-password
```

There is no self-service email reset. The administrator must verify the teammate's identity before sharing a replacement password. The CLI is a privileged offline operation requiring server/database access.

## Backups and restore drills

Back up before a migration or upgrade. From a checkout with Bun installed:

```bash
bun run db:backup
```

This uses `pg_dump` in the PostgreSQL container and creates a private `.backups/production-<timestamp>.dump` (directory mode 700, file mode 600). Backups and environment files are ignored by Git and excluded from Docker builds. Copy the dump to separate private storage off the VPS. A volume on the same VPS is not a disaster-recovery copy. Store required secrets separately so the deployment can be recreated.

Without Bun on the VPS, the equivalent manual command is:

```bash
umask 077
mkdir -p .backups
docker compose exec -T postgres pg_dump -U postgres -d qublox_sales -Fc > .backups/manual.dump
```

Verify a dump's table of contents without modifying a database:

```bash
docker compose exec -T postgres pg_restore --list < .backups/manual.dump
```

For a restore drill, create a **new, empty database** and restore into it. Do not overwrite the running application database to test a backup:

```bash
docker compose exec -T postgres createdb -U postgres qublox_restore_check
docker compose exec -T postgres pg_restore -U postgres -d qublox_restore_check --no-owner --exit-on-error < .backups/manual.dump
docker compose exec -T postgres psql -U postgres -d qublox_restore_check -c 'select count(*) from prospect;'
```

Inspect the restored data, then remove only the disposable restore-check database when finished. For an actual recovery, stop API/worker first, restore to a new database, validate it, and deliberately switch the connection configuration before restarting. The default Compose URL names `qublox_sales`; changing the recovery database requires updating that URL in Compose. Never run `docker compose down -v` against production; `-v` deletes its database volume.

## Updates

Back up, inspect the change/migration, then:

```bash
git pull
docker compose build
docker compose stop server worker
docker compose run --rm migrate
docker compose up -d --force-recreate server worker web
docker compose ps -a
```

The explicit migration run fails before the new application starts. Preserve a known working image/tag before an upgrade. Rolling an image back does not automatically undo a database migration; check schema compatibility before doing so. For an incompatible change, restore a verified backup through the recovery path.

## Operations

- API readiness: `/health` internally executes a database query. Web health checks the login route. Worker readiness is verified through its startup log and a completed job; there is no worker health endpoint in this slice.
- Jobs persist in PostgreSQL. A running job has a five-minute lease. A restarted worker can recover expired work. Website research gets up to three attempts; ambiguous LLM requests keep their budget reservation.
- One worker is enough for this volume. Additional workers use transactional claims and a workspace lock, although duplicating a timed-out model call cannot be made free; monitor the provider budget.
- Watch `docker compose logs --tail=100 worker` for `job_completed`/`job_failed`, and the review screen for user-facing failure reasons. No external monitoring service is required for the pilot.
- HTML fetching has time, response-size, page-count, robots-rule, DNS, and redirect limits. No authenticated website cookies are forwarded. Private/link-local/reserved addresses are blocked and vetted IPs are pinned for requests.
- The five-contact cap counts logged manual contacts in the last 24 hours, including follow-ups. It cannot stop messages you send elsewhere. It is unrelated to SMTP authentication or inbox placement.
- Enable the hard Gateway key/project budget before enabling AI. Local admission checks cannot guarantee a maximum bill for every model/provider response.

## Source references

The implementation uses the installed Next.js route-handler/standalone documentation, [Better Auth password configuration](https://www.better-auth.com/docs/authentication/email-password), [Docker Compose dependency conditions](https://docs.docker.com/compose/how-tos/startup-order/), [PostgreSQL backup guidance](https://www.postgresql.org/docs/18/backup-dump.html), and [Caddy reverse proxy documentation](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy). Varlock sensitivity explicitly distinguishes credentials from identity/configuration values; see [Varlock secrets](https://varlock.dev/guides/secrets/).
