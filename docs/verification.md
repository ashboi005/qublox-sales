# Verification record

Verified locally on 5–6 November 2026 with Bun 1.3.10, the committed lockfile, and PostgreSQL 18. The application is a working first slice; no actual VPS/DNS/TLS deployment or live LLM request was performed.

## Automated checks

- `bun run check-types`: all six workspaces pass.
- `bun run test`: 42 tests pass. Covers normalization, malformed input, invented/missing evidence, score-zero behavior, team membership, public-address boundaries, mixed DNS answers, extraction, robots matching (including an adversarial wildcard case), direct Groq/Gemini response validation and quota calculations, and the Maps extension cases below.
- `bun run test:integration`: 22 tests pass against isolated `qublox_sales_test`. Covers closed public signup even for a known team email, offline provisioning, session-revoking password resets, anonymous/removed-member denial, foreign-origin writes, persisted lifecycle, partial imports, list-only capture warnings, trailing-dot dedupe/suppression, concurrent daily caps, campaign approval invalidation, job claim/lease recovery, stale research cancellation, suppression processing-state cleanup, AI cost reservations, concurrent pacing, persistent cooldowns, cancellation and database-clock admission under lock contention.
- `bun run build`: Elysia API/worker bundles and Next.js standalone production build pass. Resolved Next.js version is 16.4.5.
- `bun audit --json`: `{}`; no advisories reported for the final locked graph. The unused scaffold `shadcn` CLI was removed, eliminating its two transitive findings without forcing unrelated major dependency upgrades.
- `git diff --check`: clean.

## Browser verification

Used disposable local QA data, then removed the two known test prospects, their unused offer, and the test account. No sample data is shipped or seeded by setup.

Confirmed through the actual interface:

1. Sign-in and authenticated empty pipeline.
2. Offer creation and prospect creation, persisted in PostgreSQL.
3. Research queued from the UI and completed by the separate worker against a public page; source URL, excerpt, timestamp, and explicit unverified-email state appear.
4. Manual draft saved with selected evidence; approval exposes compose/copy controls without sending.
5. Editing a recipient hides delivery controls immediately, locks unrelated forms while dirty, and saving revokes approval on the server.
6. Maps JSON file import reports one addition, one duplicate, and one invalid row while keeping the valid result.
7. Settings report disconnected Gateway/verification accurately. Follow-ups display their empty state.
8. Review screen at 320px, 375px, and desktop widths. Document width matched viewport width; content stacks on phones. Narrow settings also had no document overflow. Temporary viewport overrides were reset.

Local captures (ignored by Git/Docker) are `artifacts/review-desktop.png` and `artifacts/review-mobile.png`. They show labeled QA fixtures, not real leads. The fresh-context finish review identified low-contrast field boundaries and singular-source grammar; both were fixed and recaptured. Field borders now use the muted ink token; browser-computed Lab lightness was approximately 28 for the border versus 92 for the field surface.

Static Hallmark app-scope check: **0 Floor failures, 0 Reflex findings**, with three heuristic warnings reviewed manually. Two concern button labels; shared button CSS enforces nowrap and the controls fit at 320px. The third incorrectly treats the manual-send confirmation text as a fake send: the control calls the versioned authenticated API, records a manual contact only after confirmation, and never dispatches email. Integration tests verify the persistence and stale-version checks. Browser checks used the required computer-use API rather than a second browser driver.

## Security review

A separate-model code review found four substantive issues, all fixed with regressions: allowlist impersonation through signup, trailing DNS dots bypassing business identity, malformed Instagram refinements throwing during import, and backtracking regex in untrusted robots rules. The reviewer confirmed the fixes and independently compared 92,456 bounded robots-matching cases against a reference implementation. Public signup remains disabled; provisioning only runs in an offline process with server access.

## Integrated Maps collector

The maintained MV3 extension is in `apps/maps-extension`; the original sibling project is unchanged. A fixed file allowlist packages its eight runtime files into the app's downloadable ZIP during web development/production builds. Tests inspect the archive and exclude source tests, dependencies, and environment files. `fflate` was updated to patched 0.8.3 after its earlier version's ZIP64 advisory; the final dependency audit is clean.

The final `docker compose build web` also passes with the extension archive included in the runtime image. No deployment was performed.

Twenty-two extension/import unit tests exercise the actual collector against sanitized captured hotel/ordinary-business DOM and simulated Chrome APIs. Reproduced failures include Sponsored becoming a hotel name, nightly prices becoming phone numbers, booking-provider links becoming websites, lost CID identity, and same-count virtualized lists skipping replacement cards. Tests also cover same-name branches, already-open profiles, stale contact nodes during partial navigation, persistence across worker restarts, concurrent saves, sender rejection, scoped transfer, bridge nonce/origin checks, and CSV formula handling.

A separate-model review found stale contact nodes could survive an early title change, and navigation could race origin inspection before bridge injection. Both were reproduced and fixed with regression tests. The already-open-target exception is constrained to the same place identifier and expected business name.

Browser QA used the production web build and API on temporary loopback ports 3303/3310 against only `qublox_sales_test`, without a worker or LLM key. The authenticated preview displayed valid and missing-website records, imported one valid prospect, reported the other row, and refreshed the pipeline. A server integration check confirms list-only warnings are retained and imported contacts remain unverified. At 375px the populated preview and pipeline fit the document; table scrolling stays local. The viewport was reset and QA tabs/servers were closed. `artifacts/maps-import.png` is an ignored screenshot of disposable test data.

The in-app browser cannot install unpacked Chrome extensions. Native Chrome/Brave installation, optional permission prompts, and the live extension-to-page handshake still require a smoke check in the user's browser. The protocol has simulated-API coverage, and the receiving preview/import has actual browser coverage; neither establishes universal compatibility with changing Maps layouts. No access restrictions were bypassed.

## Containers and recovery

- Both Docker images build from the lockfile without private environment files or build-time API credentials.
- Isolated `qublox-sales-smoke` Compose stack: migrations exited 0, PostgreSQL/API/web became healthy, and the worker started. Only the web's loopback port was published; API/database ports stayed internal.
- A disposable account provisioned inside the production image authenticated through the Next.js same-origin proxy, including its session cookie. Anonymous reads and public signup were denied.
- A real research job completed in the production worker; campaign/prospect data, manual evidence-linked drafting, approval, and stale contact rejection worked through HTTP. This smoke test sent **no outreach** and made **zero LLM calls**.
- `bun run db:backup --dev` produced a custom-format PostgreSQL dump with file mode 600 inside a mode-700 directory. The dump restored successfully into a new disposable database and its prospect row count matched the source snapshot. The restore-check database was then removed.
- The smoke-test containers and their disposable volume were removed after testing. The local development database is separate and retained. The unified `bun run dev` launcher was checked to start web, API, and worker together.

## Not established by these checks

Live Groq/Gemini quality and account quotas require a saved provider key and a deliberate live evaluation. Automated verification uses stubs and makes no provider calls. The local spending ledger estimates paid list prices and is an admission guard, not a provider bill or guaranteed cap. HTTP extraction does not guarantee coverage of JavaScript-heavy or blocked sites. Email addresses have not undergone mailbox verification, and no test establishes inbox placement. VPS resource sizing, public HTTPS, remote backups, and restore procedures on your actual host must be verified at deployment.

## External PostgreSQL and direct AI providers — 6 November 2026

Default production Compose now forwards a required `DATABASE_URL` to migration/API/worker and does not start another PostgreSQL. A disposable Compose configuration with only a connection URL (no `POSTGRES_PASSWORD`) was validated; all three services received that URL and migration had no bundled database dependency. The optional `compose.postgres.yml` configuration also validates. Its existing named volume is retained. Production backups use an ephemeral `pg_dump` client pointed at the supplied URL; local dev backups still use the dev database container. The actual VPS URL has not been connected or deployed.

Merge requests/configuration were replaced with direct Groq/Gemini adapters and documented model prices/usage assumptions in `docs/ai.md`. Keys stay server-side. AI settings display provider/model, estimated allowance and local limits. No automatic provider/model fallback exists. Quota reservations and cooldowns persist in PostgreSQL; tests prove that concurrent admissions cannot both consume one paced slot, 429 Retry-After survives later calls, cooldown upserts preserve UTC, unknown costs retain reservations, and queued waits can be cancelled with version checks.

The separate-model review identified a manual-edit lockout during long quota waits and a timestamp captured before acquiring the quota lock. Both were fixed: queued cancellation restores editing, and admission uses PostgreSQL `clock_timestamp()` after lock acquisition. The timestamp defect was reproduced as a failing contention test before the fix. Local deferrals do not consume provider attempts; explicit 429 retries are bounded. No automatic retry is made after an ambiguous network/5xx response.

## Full workflow simulation — 6 November 2026

`bun run simulate` creates/migrates and resets only `qublox_sales_simulation` on local development PostgreSQL (port 5438), never the configured production `DATABASE_URL`. Through the real HTTP API it verified private login/anonymous denial, valid/invalid/duplicate imports, actual public demo-site research, timestamped evidence, manual drafting, approval, recipient-edit invalidation, stale-contact rejection, reapproval, simulated contact logging, a time-advanced due reminder, manual follow-up, reply and suppression. Research used `books.toscrape.com`, fictitious `.invalid` recipients and explicit simulation labels. There were zero LLM ledger rows and no email/DM transport calls.

The production web build was also connected to that isolated API in a real browser. It displayed the researched evidence, manual draft, full simulated activity history and new provider/pacing settings. Narrow settings fit 375px without document overflow. A second disposable prospect was added through the UI, queued, then cancelled; editing controls became enabled again. The screenshot/report in ignored `artifacts/workflow-simulation.png`, `artifacts/queue-cancelled.png` and `artifacts/workflow-simulation.json` contain simulation data. The simulation database remains disposable and is reset on each run. No actual prospect was contacted, and simulated send records exist only there.

Both production Docker images built successfully; the server image was rebuilt after the final UTC cooldown fix. The documented one-shot `bun run simulate` command passed and shut down its API. Temporary browser tabs and both QA servers were closed. Private root/server env files were aligned with the new provider fields without changing existing secrets or local login identities. No saved provider-key values were present in the checked files, and the public `.env.example` contains no credentials. The intended future origin is `https://sales.qubloxhq.com`; DNS/HTTPS and the actual VPS database connection remain deployment work.
