# Qublox website theme for the sales UI

UI only. Existing functionality from Claude stays unchanged.

- [x] Read current commits, team-outreach checklist and user guide.
- [x] Derive palette/type from qublox-website source; record Hallmark preflight.
- [x] Restyle shared controls, shell, tables, forms and review panels.
- [x] Check desktop/mobile and compare fields, handlers and routes.
- [x] Run required local checks and production build.
- [x] Record verification and commit with configured author.

Verification: 68 unit + 44 integration tests, all type checks, production build and localhost-only workflow simulation pass. Hallmark static: 0 FAIL / 0 WARN; source wiring kept. Render via CUA because puppeteer-core is unavailable. One visual-review finding resolved. See docs/verification.md and ignored artifacts/ui/compare.html.

Core visual changes landed in concurrent commit 68a2d4b. Finishing commit keeps only CSS, DESIGN.md and this verification record. No functionality changes from this task.
