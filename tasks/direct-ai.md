# Existing PostgreSQL and direct low-cost AI

- [x] Accept production DATABASE_URL; bundled PostgreSQL is an optional Compose override.
- [x] Update backups, setup templates and VPS instructions.
- [x] Verify official current Gemini/Groq models, prices and quota semantics; document low-volume usage assumptions.
- [x] Replace Merge with fixed-endpoint direct adapters and bounded evidence/JSON validation.
- [x] Add persistent request/token reservations, pacing, cooldowns and bounded explicit-rejection retries.
- [x] Add queued cancellation so manual work remains available during rate limits.
- [x] Reproduce/fix lock contention and UTC cooldown update defects.
- [x] Run unit, database and production-build checks; run a real HTTP workflow simulation without LLM/outreach.
- [x] Complete final browser/container checks and commit verified increments.

Checks: 42 unit tests, 22 database tests, type checks, production build, both Docker images and final server rebuild passed. The real HTTP workflow simulation passed, including its one-shot shutdown path. Browser verification confirmed the evidence/draft view, provider settings, 375px layout and queued cancellation restoring editing. See `docs/verification.md`. Private env files now contain the new config fields; saved provider-key values were not present at verification time.

Provider keys and actual VPS URL are user-supplied private configuration. No live provider benchmark, SMTP integration, DNS setup or VPS deployment is part of this change. Intended future origin: https://sales.qubloxhq.com. Personal emails are valid dashboard login identities; ALLOWED_EMAILS is not an outbound-mailbox setting.
