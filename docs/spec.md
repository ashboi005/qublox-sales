# Qublox sales v0.1

## Objective and accepted assumptions
Build an internal, authenticated sales research workbench for Qublox. The user authorized implementation after reviewing the research and selected Next.js, Elysia, Bun, Better Auth, PostgreSQL, Drizzle, and Docker, hosted on their VPS. This is a single shared team workspace, not a public multi-tenant SaaS. Only allowlisted email addresses may create accounts or access data.

The first usable slice is: create a campaign → add/import prospects → collect public website evidence → optionally score/draft with the team's Merge Gateway credits → edit and approve → compose/copy manually → record contact and follow-ups. Instagram is manual. The app never sends email as a side effect of approval. SMTP delivery, paid contact databases, social scraping, and automated screenshots are subsequent integrations, not prerequisites for this slice.

## Stack and structure
- `apps/web`: Next App Router, React, CSS tokens, browser auth client, same-origin API proxy.
- `apps/server`: Elysia REST endpoints and a separate durable research/drafting worker.
- `packages/auth`: Better Auth password/session configuration and signup allowlist.
- `packages/db`: Drizzle PostgreSQL schemas and checked-in SQL migrations.
- `packages/shared`: Zod boundary contracts and shared types.
- `docs/research`: existing sourced build/buy analysis.
- `tasks/plan.md`, `tasks/todo.md`: incremental plan and checkpoints.

## Commands
- Install: `bun install --frozen-lockfile --ignore-scripts`
- Local configuration: `bun run setup`
- Database: `bun run db:start`, then `bun run db:migrate`
- Develop: `bun run dev` (web, API, worker)
- Unit tests: `bun test apps/server/src packages/shared/src packages/auth/src`
- Integration tests: `bun run test:integration` (isolated local test PostgreSQL)
- Type check: `bun run check-types`
- Build: `bun run build`
- VPS: `docker compose up -d --build`

## Behavior and contracts
- All workspace APIs authenticate sessions and check membership. Unsafe methods require the configured application Origin. Auth endpoints retain Better Auth's own checks and throttling.
- Campaigns define buyer, offer, proof, and next step. Prospect domains deduplicate across campaigns to avoid duplicate outreach.
- Maps JSON import preserves provenance; it does not claim verification of imported email addresses or unrestricted rights to source data.
- Research is HTTP-first, bounded, and public-address-only. Check DNS and pin vetted addresses on every request; validate redirects. Never fetch arbitrary local/VPS services.
- Evidence contains source URL, retrieved time, type and excerpt. Unknown, blocked, and failed research remain explicit.
- LLM output is untrusted JSON: score 0–3, evidence references, rationale, subject/body. Invalid references fail. Score zero produces no suggested message. The integration is optional, server-side, token-limited, and budget-limited.
- Draft edits, recipient/channel changes, campaign changes, and refreshed evidence invalidate approval. Version checks reject stale concurrent updates.
- Approval is separate from recording a manual send. Suppression blocks further approval/contact; opt-outs and replies stop follow-ups. A default five-contact rolling 24-hour cap protects against accidentally recording a larger batch; it is not a deliverability guarantee.
- Campaign/prospect data persists in PostgreSQL; jobs use transactional claims, leases, bounded retries, and stale-result checks.

## Code style
Use strict TypeScript, named exports for domain functions, Zod at boundaries, and parameterized Drizzle queries. Example:

```ts
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
```

## Test strategy
Bun tests cover URL/SSRF boundaries, extraction, input normalization, draft validation, and lifecycle invariants. PostgreSQL integration tests exercise authentication/authorization, persistence, duplicate imports, approval invalidation, suppression, job claims, and daily limits. Browser verification covers login, empty/loading/error states, campaign creation, prospect review, keyboard access, and narrow layouts. External services are stubbed in repeatable tests; live smoke checks are identified separately.

## Boundaries
- Always: preserve research, validate boundaries, keep keys on the server, test meaningful behaviors, commit working increments.
- Authorized: scaffold, dependencies necessary for this scope, schema/migrations, auth, private local Docker testing, and VPS deployment configuration.
- Ask first: actual VPS deployment/access if not supplied, paid service purchases, sending real outreach, or materially expanding scope.
- Never: commit secrets, claim messages were sent when they were only copied, invent scraped facts, silently replace PostgreSQL with browser storage, or expose public signup on the VPS.

## Success criteria
A team member can sign up/sign in, create an offer, import/add a business, view persisted evidence, manually edit a draft or generate one when configured, approve the exact version, and record a manual contact/follow-up. Stale approvals and suppressed prospects are blocked by the server. Local production builds and meaningful tests pass. Docker configuration keeps PostgreSQL private and includes repeatable migrations and a documented backup/restore path.

## Threat model
Assets: sessions, prospect/contact data, LLM credits, VPS network access. Boundaries: browser/API, auth/database, imported files, fetched websites, DNS/redirects, model responses. Principal abuse cases: anonymous access, removed team members retaining access, cross-origin writes, private-network fetches, malicious imported URLs, prompt injection, concurrent stale approvals, duplicate contact logging, and unbounded LLM spend. Controls live in code and are tested; prompts are not a security boundary.
