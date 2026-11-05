# Maps extension integration

Scope: bring the existing extension into `apps/maps-extension`, preserve its provenance, reproduce hotel failures, then improve result discovery, detail identity, contact extraction, cancellation, and durable local collection. Connect collected records to an authenticated app import preview without giving the extension account credentials. Keep manual JSON/CSV export. Commit verified increments using the configured author.

- [x] Capture current hotel/ordinary Maps layouts and failing regressions.
- [x] Correct extraction and resilient collection; preserve records on popup/page changes.
- [x] Add scoped workspace transfer and authenticated import preview.
- [x] Package/install documentation, browser checks, full regression suite, commits.

Delivered in two commits: collector/packaging, then authenticated import preview and documentation. All 40 unit tests and 17 isolated-database integration tests pass, as do type checks and the native production build. Real browser import and phone-width checks passed. Native Chrome/Brave installation and permission prompts remain an explicitly documented user-profile smoke check because the available browser cannot load unpacked extensions. See `docs/verification.md`.

Initial hypotheses, to test independently:
1. The sponsored hotel heading is selected as the business name; name-change readiness accepts stale detail panels or rejects same-name branches.
2. Hotel results omit the feed role or use different card links, so discovery returns no results.
3. Virtualized results replace cards without changing card count, so the saved numeric index skips new places.
4. Unscoped contact extraction mistakes booking-provider links, nightly prices, or numeric labels for business contacts/reviews.
