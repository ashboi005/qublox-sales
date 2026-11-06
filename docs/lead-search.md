# Find leads (in the portal)

Prospects → **Find leads**: type the kind of business and the place, choose how many and an offer, then click **Find leads**. Qublox looks the businesses up, skips ones already in your list or on the do-not-contact list, and imports the rest with their listing (rating, reviews, address, "no website listed") as evidence. With an offer chosen and `AUTO_PIPELINE=true`, each new lead is then researched and drafted automatically. Results wait under **To review**.

## Running the same search again

Repeating a search continues where the list left off: businesses already in your workspace (same listing, website or phone) or on the do-not-contact list are skipped while paging, and only new ones are added. Google returns at most 60 businesses per search phrase (3 pages of 20). When those are used up the app says so; search a nearby area ("Ranjit Avenue, Amritsar") or a related term ("boutiques", "garment shops") for more. A repeat may use up to 3 requests if the first pages are already known, and it never uses more than the remaining monthly allowance.

## Sources

**Google Places API (New)**, used when `GOOGLE_PLACES_API_KEY` is set. One search request returns up to 20 businesses with name, phone, website, rating, review count, category and Maps link; 40 or 60 use two or three requests. Phone and website are Enterprise-tier fields, and Google gives about 1,000 Text Search Enterprise requests a month free (India pricing may differ), then charges per 1,000. `PLACES_MONTHLY_REQUEST_LIMIT` (default 900) stops the app before the free amount. Usage shows in Settings. Pricing: https://developers.google.com/maps/billing-and-pricing/pricing

Set it up once:

1. Open https://console.cloud.google.com, create or pick a project, and attach a billing account (Google requires one even for the free usage).
2. APIs & Services → Library → enable **Places API (New)**.
3. APIs & Services → Credentials → Create credentials → API key. Restrict it to **Places API (New)**.
4. Put it in the server environment as `GOOGLE_PLACES_API_KEY=` (root `.env`) and restart the API.
5. Optional: set a budget alert in Google Cloud Billing.

**OpenStreetMap** is the free fallback when no key is set. It needs no account, but in a 6 November 2026 check most Indian businesses had no phone or website tags (for example 39 hotels in Amritsar, 5 with a phone and 3 with a website), and businesses without any contact are skipped. It makes one request per search, within Nominatim's light-use policy.

The Google Maps page itself is not scraped from the server: Google blocks server scraping with CAPTCHAs. The Maps extension (Prospects → Import file) remains an optional way to collect from your own browser.
