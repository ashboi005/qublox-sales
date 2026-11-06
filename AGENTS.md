# Agent notes for qublox-sales

Read this first. It is loaded automatically by Codex (and mirrored in CLAUDE.md for Claude Code).

## Current state (6 November 2026)

Work is tracked as checklists in `tasks/*.md` and as one commit per finished slice. Before continuing, read `git log --oneline -20` and the newest `tasks/` file. Everything checked there is built, tested and committed.

Latest slice: `tasks/team-outreach.md` (all done). Codex's earlier Gmail slice (`tasks/gmail-sending.md`) was committed in Claude Code after Codex hit its usage limit; the two queued user messages after it were then implemented:

- humanized AI drafts with a `{{sender}}` placeholder
- per-teammate Gmail senders (encrypted App Passwords) and an admin role (`team:role`)
- lead tracking with a "meeting set" stage
- WhatsApp channel and businesses without websites (Maps listing as evidence)
- automatic research → draft pipeline (`AUTO_PIPELINE`)
- scraper fixes measured on 20 real sites (`docs/research/2026-11-06-scraper-hit-rate.md`)
- self-service password change
- Polish with AI on Offers (`apps/server/src/offer-polish.ts`)
- Find leads in the portal via Google Places or OpenStreetMap (`apps/server/src/discovery.ts`, `docs/lead-search.md`)
- AI rotation: Groq and Gemini alternate, back off on 429 and cover for each other (`callModel` in `apps/server/src/llm.ts`, `docs/ai.md`)
- website audit + opportunity score, Jina/Firecrawl fallback reader, on-demand Reoon email verification (`audit.ts`, `readers.ts`, `email-verify.ts`, `docs/research-tools.md`)

User-facing explanation of the app: `docs/user-guide.md`. Verification history: `docs/verification.md`.

## Rules that matter

- Commit incrementally, one slice at a time, with conventional prefixes (`feat:`, `test:`, `docs:`). Commits are authored as ashwathsoni005@gmail.com through the repo git config; do not change it.
- Root `.env` `DATABASE_URL` is the self-hosted VPS PostgreSQL. Never migrate or write to it without the owner's explicit go-ahead for that command.
- Tests, `bun run simulate` and `bun run models:check` only use a localhost database (see `scripts/local-db.ts`), taken from `LOCAL_DATABASE_URL` (shell or env files) or a localhost `DATABASE_URL`. Start it with `bun run db:start`.
- Checks before committing: `bun run check-types`, `bun run test`, `bun run test:integration`, `bun run simulate`.
- Nothing may send email or messages as a side effect of approval. Real Gmail sending stays behind `EMAIL_SENDING_ENABLED`.
