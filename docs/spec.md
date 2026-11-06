# Qublox sales v0.1

## Objective and accepted assumptions
Build an internal, authenticated sales research workbench for Qublox. The user authorized implementation after reviewing the research and selected Next.js, Elysia, Bun, Better Auth, PostgreSQL, Drizzle, and Docker, hosted on their VPS. This is a single shared team workspace, not a public multi-tenant SaaS. An administrator provisions database-backed team accounts privately using the offline CLI; public signup is disabled. The serving API checks active database membership on every request.

The first usable slice is: create a campaign → add/import prospects → collect public website evidence → optionally score/draft with the selected Groq/Gemini account → edit and approve → queue approved Gmail delivery or compose/copy manually → record contact and follow-ups. Instagram and WhatsApp are manual: WhatsApp opens your own app through a `wa.me` link with the approved text, then you mark it sent. Businesses without a website import when they have a phone, email or Instagram; their Google Maps listing (rating, reviews, address, "no website listed") becomes evidence and WhatsApp becomes the default channel. Phone numbers deduplicate and suppress like domains. The WhatsApp Cloud API is not used, because its policy requires opt-in before a business starts a conversation. The app never sends email as a side effect of approval. A separate send/schedule action queues an immutable approved snapshot for Gmail SMTP. Paid contact databases, social scraping and automated screenshots remain subsequent integrations.

## Stack and structure
- `apps/web`: Next App Router, React, CSS tokens, browser auth client, same-origin API proxy.
- `apps/server`: Elysia REST endpoints and a separate durable research/drafting worker.
- `apps/maps-extension`: unpacked MV3 Chrome/Brave collector, local saved collections, JSON/CSV export, and scoped workspace transfer.
- `packages/auth`: Better Auth password/session configuration, private provisioning and database membership, and session-revoking password resets.
- `packages/db`: Drizzle PostgreSQL schemas and checked-in SQL migrations.
- `packages/shared`: Zod boundary contracts and shared types.
- `docs/research`: existing sourced build/buy analysis.
- `tasks/plan.md`, `tasks/todo.md`: incremental plan and checkpoints.

## Commands
- Install: `bun install --frozen-lockfile --ignore-scripts`
- Local configuration: `bun run setup`
- Database: `bun run db:start`, then `bun run db:migrate`
- Team account: `bun run team:add --email dev@qublox.local --name 'Local user'`
- Develop: `bun run dev` (web, API, worker)
- Unit tests: `bun run test` (includes captured-DOM and simulated Chrome API extension regressions)
- Extension ZIP: `bun run extension:build` (also runs during web dev/build)
- Integration tests: `bun run test:integration` (isolated local test PostgreSQL)
- Type check: `bun run check-types`
- Build: `bun run build`
- VPS: set existing `DATABASE_URL`, then `docker compose up -d --build`; `compose.postgres.yml` is optional bundled PostgreSQL

## Behavior and contracts
- All workspace APIs authenticate sessions and check membership. Unsafe methods require the configured application Origin. Auth endpoints retain Better Auth's own checks and throttling.
- Campaigns define buyer, offer, proof, and next step. Prospect domains deduplicate across campaigns to avoid duplicate outreach.
- Maps JSON import preserves provenance; it does not claim verification of imported email addresses or unrestricted rights to source data.
- The extension collects only visible Maps DOM, up to 100 places/10 minutes per run. Match the clicked place before accepting detail contacts; otherwise retain a marked list-only record. Collections persist locally across popup closure/reloads. Workspace permission is requested for the selected origin; transfer opens an authenticated preview, never an automatic import. The bridge rechecks the destination origin at injection time, and nonce/source/origin checks bound the page exchange. The app validates the batch and the normal authenticated import endpoint validates each row. Missing websites remain exportable; list-only warnings survive import as notes.
- Research is HTTP-first, bounded, and public-address-only. Check DNS and pin vetted addresses on every request; validate redirects. Never fetch arbitrary local/VPS services.
- Evidence contains source URL, retrieved time, type and excerpt. Unknown, blocked, and failed research remain explicit.
- LLM output is untrusted JSON: score 0–3, evidence references, rationale, subject/body. Invalid references fail. Score zero produces no suggested message. The integration is optional, server-side, token-limited, and budget-limited. Direct Groq/Gemini adapters use fixed endpoints; PostgreSQL serializes request/token admissions and persists provider cooldowns. Local waits do not consume attempts; explicit 429s retry at most three times. Ambiguous failures require manual retry. Queued work can be cancelled with a version-checked action. Cost records are paid-list-price estimates, including conservative reservations for unknown outcomes.
- Draft edits, recipient/channel changes, campaign changes, and refreshed evidence invalidate approval. Version checks reject stale concurrent updates.
- Approval is separate from recording a manual send. Suppression blocks further approval/contact; opt-outs and replies stop follow-ups. A default ten-contact/send-attempt rolling 24-hour cap protects against accidentally recording a larger batch; it is not a deliverability guarantee.
- Campaign/prospect data persists in PostgreSQL; jobs use transactional claims, leases, bounded retries, and stale-result checks.

## Code style
Use strict TypeScript, named exports for domain functions, Zod at boundaries, and parameterized Drizzle queries. Example:

```ts
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
```

## Test strategy
Bun tests cover URL/SSRF boundaries, extraction, input normalization, draft validation, and lifecycle invariants. PostgreSQL integration tests exercise authentication/authorization, persistence, duplicate imports, approval invalidation, suppression, job claims, daily limits, concurrent AI admissions, cooldowns, queued cancellation and admission clocks under lock contention. Browser verification covers login, empty/loading/error states, campaign creation, prospect review, keyboard access, and narrow layouts. External services are stubbed in repeatable tests; live smoke checks are identified separately.

## Boundaries
- Always: preserve research, validate boundaries, keep keys on the server, test meaningful behaviors, commit working increments.
- Authorized: scaffold, dependencies necessary for this scope, schema/migrations, auth, private local Docker testing, and VPS deployment configuration.
- Ask first: actual VPS deployment/access if not supplied, paid service purchases, sending real outreach, or materially expanding scope.
- Never: commit secrets, claim messages were sent when they were only copied, invent scraped facts, silently replace PostgreSQL with browser storage, or expose public signup on the VPS.

## Success criteria
A privately provisioned team member can sign in, create an offer, import/add a business, view persisted evidence, manually edit a draft or generate one when configured, approve the exact version, and record a manual contact/follow-up. Stale approvals and suppressed prospects are blocked by the server. Local production builds and meaningful tests pass. Docker configuration keeps PostgreSQL private and includes repeatable migrations and a documented backup/restore path.

## Threat model
Assets: sessions, prospect/contact data, LLM credits, VPS network access. Boundaries: browser/API, auth/database, imported files, fetched websites, DNS/redirects, model responses. Principal abuse cases: anonymous access, removed team members retaining access, cross-origin writes, private-network fetches, malicious imported URLs, prompt injection, concurrent stale approvals, duplicate contact logging, and unbounded LLM spend. Controls live in code and are tested; prompts are not a security boundary.

## Gmail outbox and membership

`team:add` creates active PostgreSQL membership; public signup remains disabled. Removal disables membership and revokes sessions without restarting. Legacy allowlists are only used by the explicit one-time migration CLI.

The outbox supports one approved email per prospect in queued/sending/uncertain states, explicit sender pools, bounded randomized-window scheduling, expedite and cancel. Edits revoke queued snapshots. Dispatch rechecks approval/suppression under the workspace lock and reserves the shared ten-attempt rolling cap. Ambiguous results never retry automatically. TLS attempts have a 45-second claim-anchored deadline and stale rows recover as uncertain after two minutes, even while sending is paused. Manual reconciliation is version-checked and preserves suppression. Gmail acceptance starts the existing manual follow-up reminder; reply synchronization and automatic follow-up copy/sending are not included.
