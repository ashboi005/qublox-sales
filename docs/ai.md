# AI provider choice and usage

Researched 5 November 2026, rotation added 6 November 2026. Merge is removed from the active application. With both a Groq and a Gemini key the app alternates between them and uses each as the other's fallback (see **Rotation and fallback** below). It never upgrades models automatically. Manual research/drafting still works without a key.

## Recommendation

Start with **Groq `openai/gpt-oss-20b`** for the low-volume pilot. It is a production model on Groq, currently listed on its free plan, and has lower paid token prices than the Gemini options below. This is a cost/availability choice, not a measured writing-quality win. Evaluate a few drafts against real evidence before relying on its suggestions. Use **Gemini `gemini-3.5-flash-lite`** if its outputs work better for you. Older 2.5/3.1 Lite models remain selectable for accounts that still have access. The live API rejected 2.5 for this new account and recommended 3.5. Groq `openai/gpt-oss-120b` is supported for a deliberate quality comparison at higher cost.

| Model | Paid input / million tokens | Paid output / million tokens |
| --- | ---: | ---: |
| Groq GPT-OSS 20B | $0.075 | $0.30 |
| Groq GPT-OSS 120B | $0.15 | $0.60 |
| Gemini 2.5 Flash-Lite | $0.10 | $0.40 |
| Gemini 3.1 Flash-Lite (legacy) | $0.25 | $1.50 |
| Gemini 3.5 Flash-Lite (default Gemini option) | $0.30 | $2.50 |

Sources: [Groq production models/prices](https://console.groq.com/docs/models), [Google API pricing](https://ai.google.dev/gemini-api/docs/pricing). Google lists a free tier for both Flash-Lite models; availability depends on the project/region/account. Its pricing page says free-tier inputs may be used to improve products. Send only the public business evidence and offer information you are comfortable processing there.

## Expected usage

Planning assumption: 10 prospects × 22 working days = 220 initial drafts; allow 80 regenerations = **300 requests/month**. Website scraping itself makes **zero LLM calls**. Scoring and drafting happen together in one call. There are no background enrichment, classification, or follow-up-generation calls.

At an illustrative **2,000 input + 800 output tokens per request**, including reasoning tokens, 300 requests consume 600,000 input + 240,000 output tokens. Paid list-price estimates: **$0.117 Groq 20B**, **$0.234 Groq 120B**, **$0.156 Gemini 2.5 Lite**, **$0.510 Gemini 3.1 Lite**, or **$0.780 Gemini 3.5 Lite** per month. These are calculations, not measured usage or quotes. Qualifying free-tier requests can cost $0; a key alone does not establish free-tier eligibility or prevent billing. Regenerations and manually retried ambiguous failures add usage.

The request builder caps message JSON at 7,500 UTF-8 bytes and output at 1,600 tokens. It sends bounded offer fields and up to six short evidence excerpts. Groq uses low reasoning; legacy Gemini 2.5 disables thinking; Gemini 3.1/3.5 use minimal thinking. Gemini uses the native generateContent API with a required object response schema; object and bounded chunk-array transport responses are normalized and thinking tokens are metered. Large evidence is shortened, not sent wholesale. Every response still passes schema/evidence checks and needs human approval.

## Draft voice (humanized)

The system prompt (`draftInstructions` in `apps/server/src/llm-provider.ts`) embeds a condensed version of the humanizer skill's rules plus the team's style: plain and warm, mixed sentence lengths, a little natural redundancy, full stops instead of dashes, few commas, no hype words, no exclamation marks, one question, under 120 words. The full skill is about 5,200 words, too large for free-tier token limits, so only its highest-signal rules are included.

The model also reasons about what the business plausibly needs (online booking, a mobile-friendly site, a store, enquiry automation) from what the evidence shows or lacks, then offers that idea softly as a question. The rationale explains the reasoning to the reviewer.

Every draft uses the literal placeholder `{{sender}}`: "{{sender}} here from Qublox." It is filled in with the first name of whichever teammate's Gmail sends the message, or your own name when you copy a message to send manually. `COMPANY_NAME` sets the company used in the prompt.

Model output is cleaned before saving: long dashes, curly quotes and bracket placeholders like `[Your Name]` are replaced, an invented sender name ("Alex here from Qublox") becomes `{{sender}}`, duplicated sign-offs are removed, and one-line bodies get their line breaks back. Approval is blocked while any other placeholder (for example `{{first_name}}` or `[Company]`) remains. The review screen also shows an advisory style check for common AI tells.

## Setup

Edit the root `.env` (the one file for local development, commands and Coolify):

```dotenv
LLM_PROVIDER=groq
GROQ_API_KEY=your-key
GEMINI_API_KEY=
LLM_MODEL=openai/gpt-oss-20b
LLM_ROTATE=true
LLM_MONTHLY_BUDGET_USD=1
# Optional overrides; the defaults below already sit under each free tier.
GROQ_RPM=20
GROQ_RPD=800
GROQ_TPM=8000
GROQ_TPD=180000
GEMINI_RPM=10
GEMINI_RPD=250
GEMINI_TPM=200000
GEMINI_TPD=2000000
```

The old `LLM_RPM`, `LLM_RPD`, `LLM_TPM` and `LLM_TPD` settings are no longer read and can be deleted.

To switch, set `LLM_PROVIDER=gemini`, `GEMINI_API_KEY=your-key`, and `LLM_MODEL=gemini-3.5-flash-lite`. An empty `LLM_MODEL` selects that provider's default. A model belonging to the wrong provider fails configuration validation. Keys stay on the server. Restart/recreate API and worker after configuration changes. Old `MERGE_*` variables are ignored and can be removed from your private configuration.

## Rotation and fallback

With both keys set, each AI call goes to whichever provider was used least recently and has capacity right now, so drafts alternate Groq, Gemini, Groq. `LLM_PROVIDER` decides who goes first and `LLM_MODEL` applies to that provider only; the other uses its default model. `LLM_ROTATE=false` turns this off.

- **Rate limited (HTTP 429):** that provider pauses for 2 minutes, doubling for each further 429 within 30 minutes (4, 8, 16, capped at 30), or longer if the provider's `Retry-After` asks. The same draft is sent to the other provider immediately.
- **Outage (5xx, timeout, network error):** that provider pauses for 2 minutes and the other one is tried. The failed request keeps its cost reservation because it may have been billed.
- **Configuration rejection (400, 401, 403, 404, 422):** the other provider is tried; with no other provider the job fails with the HTTP status so the key or model can be fixed.
- **Unusable answer** (bad JSON, citing evidence that was not supplied): the other provider gets one try before the draft is marked failed.
- **Both busy:** the job waits until the earliest provider frees up. Waiting for local pacing does not use up a retry; a real provider rejection does, three at most.

Token use is estimated as a third of the request's UTF-8 bytes plus overhead, then corrected to the provider's reported count after each call. Settings → AI request pacing lists each provider's allowance and any active pause.

## Limits and recovery

Groq's published free-plan summary for GPT-OSS 20B currently shows 30 RPM, 1,000 RPD, 8,000 TPM and 200,000 TPD. These are shared at organization level and exceptions exist: check your [Groq limits](https://console.groq.com/settings/limits). Google's effective limits are project-specific and must be read in [AI Studio](https://aistudio.google.com/rate-limit); Google does not promise one universal free-tier quota. Sources: [Groq limit semantics and headers](https://console.groq.com/docs/rate-limits), [Google limits](https://ai.google.dev/gemini-api/docs/rate-limits).

The app's defaults are conservative local allowances, not claimed account quotas. Set them **at or below your actual console values**, allowing for other applications sharing that organization/project. Local request/token checks use rolling minutes and rolling 24 hours, rather than assuming a provider's daily reset timezone. Input tokens are reserved as a third of the UTF-8 bytes plus overhead; output uses its full cap until the provider reports actual usage. Shared PostgreSQL admission locks coordinate workers; attempts and cooldowns survive restarts. Token estimates cannot replace the provider's tokenizer or account-wide meter.

The worker queues calls until local capacity is available. A 429 honors `Retry-After` (seconds or HTTP date) and Groq reset headers; missing guidance uses at least a one-minute pause. Three explicit provider rejections exhaust that job's attempts. Local waiting does not consume attempts. Use **Cancel queued work** to continue manually during a long wait. Timeouts, network failures, 5xx responses and malformed drafts are handed to the other provider when one is configured; an ambiguous request may already have been billed. There is no rotation of several keys for the same provider to get around a quota.

The monthly ledger estimates at paid list prices even on a free tier. Unknown outcomes retain a conservative reservation; known 429 rejections release cost but retain rate-limit accounting. Historical Merge estimates remain in the same month's ledger. It is a local admission allowance, not an invoice or guaranteed provider spending cap. Configure available provider-side spending controls separately, and review prices when changing models.

## Verification boundaries

Provider requests are stubbed in automated tests: no real key, credits, or outreach is used. Tests cover endpoint/key selection, bounded multilingual input, evidence validation, token prices, concurrent admissions, durable cooldowns, queued-job cancellation and ambiguous-cost reservations. A successful local test does not establish free-tier access, live model quality, or the quotas of your particular account.

Live model checks on 6 November 2026: Groq GPT-OSS 20B and Gemini 3.5 Flash-Lite both returned validated score/evidence-linked JSON for a fictional workshop fixture. This is a functional check, not a quality benchmark. Google returned 404 explaining that 2.5 Lite is unavailable to new users; the supported Gemini default was updated accordingly. The optional `scripts/check-models.ts` command makes real provider calls and writes only an ignored, non-credential report in `artifacts/model-check.json`. Normal unit/integration tests and the workflow simulation still make zero LLM calls.
