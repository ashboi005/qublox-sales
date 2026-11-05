# Verification record

Verified locally on 5 November 2026 with Bun 1.3.10, the committed lockfile, and PostgreSQL 18. The application is a working first slice; no actual VPS/DNS/TLS deployment or live LLM request was performed.

## Automated checks

- `bun run check-types`: all six workspaces pass.
- `bun run test`: 18 tests pass. Covers normalization, malformed input, invented/missing evidence, score-zero behavior, team membership, public-address boundaries, mixed DNS answers, extraction, robots matching (including an adversarial wildcard case), and Gateway output/cost validation.
- `bun run test:integration`: 16 tests pass against isolated `qublox_sales_test`. Covers closed public signup even for a known team email, offline provisioning, session-revoking password resets, anonymous/removed-member denial, foreign-origin writes, persisted lifecycle, partial imports, trailing-dot dedupe/suppression, concurrent daily caps, campaign approval invalidation, job claim/lease recovery, stale research cancellation, suppression processing-state cleanup, and ambiguous Gateway cost reservations.
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

## Containers and recovery

- Both Docker images build from the lockfile without private environment files or build-time API credentials.
- Isolated `qublox-sales-smoke` Compose stack: migrations exited 0, PostgreSQL/API/web became healthy, and the worker started. Only the web's loopback port was published; API/database ports stayed internal.
- A disposable account provisioned inside the production image authenticated through the Next.js same-origin proxy, including its session cookie. Anonymous reads and public signup were denied.
- A real research job completed in the production worker; campaign/prospect data, manual evidence-linked drafting, approval, and stale contact rejection worked through HTTP. This smoke test sent **no outreach** and made **zero LLM calls**.
- `bun run db:backup --dev` produced a custom-format PostgreSQL dump with file mode 600 inside a mode-700 directory. The dump restored successfully into a new disposable database and its prospect row count matched the source snapshot. The restore-check database was then removed.
- The smoke-test containers and their disposable volume were removed after testing. The local development database is separate and retained. The unified `bun run dev` launcher was checked to start web, API, and worker together.

## Not established by these checks

Live Gateway model compatibility/costs require your actual key and accessible model ID. The local spending ledger is an admission guard; configure the provider-side hard cap. HTTP extraction does not guarantee coverage of JavaScript-heavy or blocked sites. Email addresses have not undergone mailbox verification, and no test establishes inbox placement. VPS resource sizing, public HTTPS, remote backups, and restore procedures on your actual host must be verified at deployment.
