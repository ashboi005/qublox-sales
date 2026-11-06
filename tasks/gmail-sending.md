# Gmail automation and database membership

Accepted: both Send now and bulk scheduling, selectable individual Gmail sender or pool, ten contacts/attempts per rolling 24h across the team. No hidden word permutations or claim of avoiding spam. Approval stays separate from dispatch; the reviewed snapshot is immutable. Gmail App Password setup is user-owned; real sending defaults off. No real outreach is authorized by the simulation.

- [x] Database membership, private add/remove/reset CLI, legacy migration and revocation regressions (1863c94).
- [x] Durable outbox, explicit sender pools, random window scheduling, expedite/cancel, shared pacing/cap.
- [x] Fail-closed ambiguous SMTP recovery and a claim-anchored absolute socket deadline.
- [x] Single and bulk UI plus Outbox and secret-free settings.
- [x] Live Groq and account-compatible Gemini checks; fix Gemini schema/model availability.
- [x] 48 unit and 34 database regressions, types, native build and fake-SMTP workflow simulation.
- [x] Finish browser date-window/cancellation/responsiveness checks and final container packaging.
- [x] Record verification, clean up temporary servers and commit.

No automatic follow-up copy/sending or Gmail reply synchronization in this slice. Follow-up reminders and manual activity recording remain available. Real Gmail authentication/acceptance cannot be established until an actual sender is connected.
