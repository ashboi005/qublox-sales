# AI provider choice and usage

Researched 5 November 2026. Merge is removed from the active application. This app calls one selected provider directly; it never falls back to a second provider or upgrades models automatically. Manual research/drafting still works without a key.

## Recommendation

Start with **Groq `openai/gpt-oss-20b`** for the low-volume pilot. It is a production model on Groq, currently listed on its free plan, and has lower paid token prices than the Gemini options below. This is a cost/availability choice, not a measured writing-quality win. Evaluate a few drafts against real evidence before relying on its suggestions. Use **Gemini `gemini-2.5-flash-lite`** if its outputs work better for you; `gemini-3.1-flash-lite` is another supported choice. Groq `openai/gpt-oss-120b` is supported for a deliberate quality comparison at higher cost.

| Model | Paid input / million tokens | Paid output / million tokens |
| --- | ---: | ---: |
| Groq GPT-OSS 20B | $0.075 | $0.30 |
| Groq GPT-OSS 120B | $0.15 | $0.60 |
| Gemini 2.5 Flash-Lite | $0.10 | $0.40 |
| Gemini 3.1 Flash-Lite | $0.25 | $1.50 |

Sources: [Groq production models/prices](https://console.groq.com/docs/models), [Google API pricing](https://ai.google.dev/gemini-api/docs/pricing). Google lists a free tier for both Flash-Lite models; availability depends on the project/region/account. Its pricing page says free-tier inputs may be used to improve products. Send only the public business evidence and offer information you are comfortable processing there.

## Expected usage

Planning assumption: 5 prospects × 22 working days = 110 initial drafts; allow 40 regenerations = **150 requests/month**. Website scraping itself makes **zero LLM calls**. Scoring and drafting happen together in one call. There are no background enrichment, classification, or follow-up-generation calls.

At an illustrative **2,000 input + 800 output tokens per request**, including reasoning tokens, 150 requests consume 300,000 input + 120,000 output tokens. Paid list-price estimates: **$0.059 Groq 20B**, **$0.117 Groq 120B**, **$0.078 Gemini 2.5 Lite**, or **$0.255 Gemini 3.1 Lite** per month. These are calculations, not measured usage or quotes. Qualifying free-tier requests can cost $0; a key alone does not establish free-tier eligibility or prevent billing. Regenerations and manually retried ambiguous failures add usage.

The request builder caps message JSON at 5,500 UTF-8 bytes and output at 1,600 tokens. It sends bounded offer fields and up to six short evidence excerpts. Groq uses low reasoning; Gemini 2.5 disables thinking; Gemini 3.1 uses minimal thinking. Large evidence is shortened, not sent wholesale. Every response still passes schema/evidence checks and needs human approval.

## Setup

For Docker, edit root `.env`. For local development, edit `apps/server/.env.local`:

```dotenv
LLM_PROVIDER=groq
GROQ_API_KEY=your-key
GEMINI_API_KEY=
LLM_MODEL=openai/gpt-oss-20b
LLM_RPM=1
LLM_RPD=20
LLM_TPM=8000
LLM_TPD=100000
LLM_MONTHLY_BUDGET_USD=1
```

To switch, set `LLM_PROVIDER=gemini`, `GEMINI_API_KEY=your-key`, and `LLM_MODEL=gemini-2.5-flash-lite`. An empty `LLM_MODEL` selects that provider's default. A model belonging to the wrong provider fails configuration validation. Keys stay on the server. Restart/recreate API and worker after configuration changes. Old `MERGE_*` variables are ignored and can be removed from your private configuration.

## Limits and recovery

Groq's published free-plan summary for GPT-OSS 20B currently shows 30 RPM, 1,000 RPD, 8,000 TPM and 200,000 TPD. These are shared at organization level and exceptions exist: check your [Groq limits](https://console.groq.com/settings/limits). Google's effective limits are project-specific and must be read in [AI Studio](https://aistudio.google.com/rate-limit); Google does not promise one universal free-tier quota. Sources: [Groq limit semantics and headers](https://console.groq.com/docs/rate-limits), [Google limits](https://ai.google.dev/gemini-api/docs/rate-limits).

The app's defaults are conservative local allowances, not claimed account quotas. Set them **at or below your actual console values**, allowing for other applications sharing that organization/project. Local request/token checks use rolling minutes and rolling 24 hours, rather than assuming a provider's daily reset timezone. Input tokens are reserved using UTF-8 bytes plus protocol overhead; output uses its full cap. This intentionally overcounts ordinary text. Shared PostgreSQL admission locks coordinate workers; attempts and cooldowns survive restarts. Token estimates cannot replace the provider's tokenizer or account-wide meter.

The worker queues calls until local capacity is available. A 429 honors `Retry-After` (seconds or HTTP date) and Groq reset headers; missing guidance uses at least a one-minute pause. Three explicit provider rejections exhaust that job's attempts. Local waiting does not consume attempts. Use **Cancel queued work** to continue manually during a long wait. Timeouts, network failures, 5xx responses and malformed drafts are not automatically retried; an ambiguous request may already have been billed. There is no key rotation to bypass quotas.

The monthly ledger estimates at paid list prices even on a free tier. Unknown outcomes retain a conservative reservation; known 429 rejections release cost but retain rate-limit accounting. Historical Merge estimates remain in the same month's ledger. It is a local admission allowance, not an invoice or guaranteed provider spending cap. Configure available provider-side spending controls separately, and review prices when changing models.

## Verification boundaries

Provider requests are stubbed in automated tests: no real key, credits, or outreach is used. Tests cover endpoint/key selection, bounded multilingual input, evidence validation, token prices, concurrent admissions, durable cooldowns, queued-job cancellation and ambiguous-cost reservations. A successful local test does not establish free-tier access, live model quality, or the quotas of your particular account.
