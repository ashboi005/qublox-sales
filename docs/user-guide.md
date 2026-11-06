# How to use Qublox Sales

A plain walkthrough of the app as it works today (6 November 2026).

## The idea in one line

Find businesses → the app reads their website (or Maps listing) → AI writes a short, human-sounding first message → **you review and approve it** → send by Gmail, WhatsApp or Instagram → track replies and meetings.

Nothing is ever sent just because a draft exists or was approved. Sending is always a separate, deliberate click.

## Words used in the app

| Term | What it means |
|---|---|
| **Prospect** (or lead) | One business you might contact. |
| **Offer** (was "campaign"; **Polish with AI** on the Offers page tidies a rough one) | What you are pitching to a group, e.g. "WhatsApp booking site for clinics". Every draft is written against one offer. Make one offer per niche per month. |
| **Evidence** | Facts about the business with a source link: website text, platform clues (Shopify, WordPress), its Google Maps listing, or a note you add. The AI may only use evidence. |
| **Research** | The app reading the business's public website: homepage plus contact/about pages. It collects emails, phones, WhatsApp links, Instagram and page text. |
| **Signal score 0–3** | How strong the reason to reach out is. 0 = nothing useful (skipped, no message), 1 = a relevant fact, 2 = a specific likely need, 3 = a clear need or request. |
| **Draft** | The suggested message. `{{sender}}` in it becomes the first name of whoever sends it. |
| **Approve** | You confirm this exact text and recipient are OK. Any later edit removes the approval. |
| **Outbox** | Approved emails waiting to go out through Gmail, with their status. |
| **Sender / sender pool** | A teammate's connected Gmail. A pool is several, and the app uses whichever is free next. |
| **Daily limit** | At most 10 contacts per rolling 24 hours for the whole team, across every channel and Gmail. |
| **Suppress / do-not-contact** | Blocks a business by website, email and phone forever. |
| **Status** | Where a lead is: new → researched → review → approved → contacted → replied → meeting → closed. Also skipped or suppressed. |

## Where things are

Top navigation:

- **Prospects**: the lead tracker. Stage buttons (To review, Contacted, Replied, Meeting set…), search, the import/add buttons and bulk email scheduling.
- **Offers**: create and edit what you are pitching.
- **Follow-ups**: contacted leads whose 7-day reminder is due. Mark follow-up sent, replied, meeting set or close.
- **Outbox**: every queued, sent, failed or uncertain Gmail send.
- **Settings**: your password, your Gmail sender, and what the server has switched on.

## The scraper: where it is and what it does

There are two parts, and the first one is now a button in the portal.

1. **Finding businesses: Prospects → Find leads.** Type the kind of business ("clothing stores") and the place ("Amritsar"), pick how many and an offer, and click **Find leads**. It uses Google Places when the server has a key (best), or OpenStreetMap for free (few contacts). See `docs/lead-search.md`. The Maps Chrome extension (Prospects → Import file) is still available as an optional alternative.
2. **Finding contacts: website research** (runs on the server). For each business with a website it reads the homepage and up to three contact/about pages, and tries `/contact` when none is linked. It pulls emails, including Cloudflare-hidden and "name [at] site" ones, phones and WhatsApp links. It respects robots.txt and never logs in. On a 20-site real sample it found an email on 70% of sites and an email or phone on 85% (see `docs/research/2026-11-06-scraper-hit-rate.md`).

Businesses **without a website** still import if they have a phone, email or Instagram. Their Maps listing becomes the evidence, for example "No website is listed", which is itself a good reason to pitch a website. Their channel defaults to WhatsApp.

## Day-to-day flow

1. **Set up once (admin).** Create an offer under Offers. Add teammates with `bun run team:add`. Each teammate signs in, changes their password, and connects their Gmail under Settings.
2. **Collect leads.** Click **Find leads** on Prospects, type the niche and city, choose the offer. Or **Add one** for a single business (name plus one contact method), or **Import file** for an extension export.
3. **Let it work.** With an offer chosen (in Find leads, Add one or Import), the app researches each website automatically and then asks the AI for a draft. This is `AUTO_PIPELINE`, on by default. Leads without a website go straight to drafting. Watch the status change on the Prospects list.
4. **Review** (Prospects → **To review**, open a lead). The left side shows the evidence; the right side shows the draft. Edit anything, check the style hints, check the recipient and channel, then **Approve saved version**. Skip leads with no good angle.
5. **Send.**
   - **Email**: on the lead, pick your Gmail and **Send now**. For many at once, use **Schedule reviewed emails** on Prospects to spread them across a time window.
   - **WhatsApp**: **Open WhatsApp with message** opens your own WhatsApp with the text filled in. Send it there, then click **Mark as sent**.
   - **Instagram**: **Copy message**, send the DM yourself, then **Mark as sent**.
6. **Track.** Gmail sends mark the lead contacted automatically. Seven days later it appears in **Follow-ups**. When someone answers, click **Mark replied**, then **Meeting set**, and **Close lead** when it's done either way. Use **Add to do-not-contact list** if anyone asks not to be contacted.

## Roles

- **Member**: everything above, but sends email only from their own Gmail.
- **Admin**: can also send from any teammate's Gmail (alone or as a pool) and disconnect senders. Granted on the server: `bun run team:role --email you@gmail.com --role admin`.

Everyone can change their own password in **Settings → Your account**.

## Server switches (`.env`)

- `EMAIL_SENDING_ENABLED`: Gmail sending master switch (false until you're ready).
- `AUTO_PIPELINE`: automatic research and drafting for new leads.
- `DAILY_CONTACT_LIMIT`: team-wide contacts per 24 hours (10).
- `COMPANY_NAME`: used in "Mania here from Qublox".
- `GROQ_API_KEY` / `GEMINI_API_KEY` / `LLM_PROVIDER`: the AI used for drafts.
