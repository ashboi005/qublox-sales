# Team senders, humanized drafts, lead tracking, WhatsApp, automation

Requested 6 November 2026 (two messages queued after the Gmail slice). Continued in Claude Code after Codex hit its usage limit.

Decisions:

- Each teammate connects their own Gmail with an App Password from Settings. Passwords are encrypted at rest (AES-256-GCM, key derived from `BETTER_AUTH_SECRET`) and never returned by the API.
- Roles: `admin` can see and send from every connected mailbox; `member` can send only from their own. Roles are granted by the offline `team:add --role admin` command, never over HTTP.
- Drafts use a `{{sender}}` placeholder. It renders as the sending mailbox's display name at dispatch, so a pooled email to a client says "Mania here from Qublox" when Mania's Gmail sends it.
- Drafting prompt embeds a condensed version of the humanizer skill plus the team's style rules (no em dashes, few commas, plain and slightly redundant like a real person). Dashes and curly quotes are also removed deterministically.
- Lead tracker: add a `meeting` status (meeting set) after `replied`; the Prospects table shows the last touch and channel.
- WhatsApp is a manual channel: a `wa.me` link opens your own WhatsApp with the approved text, then "Mark sent" records it. No WhatsApp API (first-contact marketing via the Cloud API needs prior opt-in).
- Businesses without a website can be imported when they have a phone, email or Instagram. Maps listing details become evidence so the AI can still draft.
- Automation: imports with an offer queue research automatically; finished research queues a draft when AI is configured. Review and approval stay human.

Checkpoints:

- [x] Humanized drafting prompt, `{{sender}}` placeholder, deterministic style cleanup.
- [x] Admin role, per-member encrypted Gmail mailboxes, SMTP login check, setup instructions, sender-name rendering.
- [x] Lead tracker: meeting status and table columns.
- [ ] WhatsApp channel and businesses without websites.
- [ ] Automatic research → draft pipeline.
- [ ] Scraper improvements (Cloudflare-protected emails, JSON-LD, obfuscated addresses, common contact paths, WhatsApp links) with a real-site hit-rate check.
- [ ] Verification record, simulation, commit.
