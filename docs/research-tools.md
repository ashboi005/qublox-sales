# Research tools: audit, page readers and email verification

Added 6 November 2026. Everything here is free to run. Each service is either free with no billing possible, or capped locally below its free allowance.

| Service | Used for | Key needed | Free allowance (checked 6 Nov 2026) | Local cap | Can it bill you? |
|---|---|---|---|---|---|
| Google PageSpeed Insights | Mobile speed in the website audit | Yes (`PAGESPEED_API_KEY`) | About 25,000 a day | none needed | No. The API has no paid tier. |
| Jina Reader | First fallback when a site can't be read directly | No | 20 pages a minute without a key | Rate-limited by Jina | No, without a key. Leave `JINA_API_KEY` empty. |
| Firecrawl | Second fallback | Yes (`FIRECRAWL_API_KEY`) | 1,000 pages a month, free plan, no card | `FIRECRAWL_MONTHLY_LIMIT=900` | Not on the free plan without a card. |
| Reoon Email Verifier | On-demand email checks | Yes (`REOON_API_KEY`) | About 600 checks a month | `REOON_MONTHLY_LIMIT=500` | Not without buying credits. |

Usage is recorded in the `api_usage` table and shown under **Settings**. Free-tier terms change, so recheck the providers' pricing pages now and then.

## Getting the keys

Put each key on its own line in `apps/server/.env.local` (local development) and in root `.env` (VPS), then restart the server and worker. Never paste keys in chat or commit them.

### PageSpeed Insights

1. Open console.cloud.google.com. The project you use for Places is fine.
2. **APIs & Services → Library**, search **PageSpeed Insights API**, click **Enable**.
3. **APIs & Services → Credentials → Create credentials → API key**.
4. Edit the new key: under **API restrictions** choose **Restrict key** and tick only **PageSpeed Insights API**. Save.
5. Add `PAGESPEED_API_KEY=<key>`.

Use a separate key from Places so each key can only call its own API. Without this key the audit still runs its on-page checks, but skips the speed test.

### Jina Reader

Nothing to do. It is used without a key, which keeps it free and impossible to bill.

### Firecrawl

1. Sign up at firecrawl.dev (Google sign-in works). Do not add a card.
2. Dashboard → **API Keys** → copy the key (starts with `fc-`).
3. Add `FIRECRAWL_API_KEY=<key>`.

### Reoon

1. Sign up at emailverifier.reoon.com.
2. Dashboard → **API** → create a key.
3. Add `REOON_API_KEY=<key>`.

## How each piece behaves

- **Website audit** runs during research and never contacts the business. It checks HTTPS, the mobile viewport tag, the footer copyright year, booking, store, WhatsApp and contact-form signs, plus PageSpeed's mobile score and the time until the main content appears (largest contentful paint). Problems become one "Website audit" evidence item.
- **Opportunity score** (0–100) comes from the listing and the audit, for example: no website +45, slow mobile +20, not mobile friendly +15, no HTTPS +10, copyright three or more years old +10, no booking for appointment trades +10, no store for retail +10, 50+ Google reviews +10, email available +5, no email or phone −20. The research/draft queue runs the highest first.
- **Page readers** run only when our own fetch gets an error, a non-200 page or no readable text. An explicit robots.txt disallow still stops research before any reader is used. A missing or forbidden robots.txt (4xx) places no rules, as RFC 9309 says. Through a reader, at most the homepage and one contact page are read.
- **Email verification** never runs on import, research or approval. It runs only on **Verify email** or on **Verify & send**. It uses Reoon's power mode, which checks the mailbox itself and can take up to a minute. Results are kept for 30 days for the same address, and editing the address resets the check. An invalid result blocks queueing that address.
