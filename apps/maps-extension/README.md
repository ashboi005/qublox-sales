# Qublox Maps Collector 1.1

The original extension from the sibling `google-maps-scrapping-extension` project now lives here. The sibling directory is unchanged. This folder is the maintained version; no build step is needed to load it unpacked.

## Install

In Chrome or Brave, open `chrome://extensions` (Brave also has `brave://extensions`), enable Developer mode, select **Load unpacked**, and choose this folder. If you downloaded the ZIP from Qublox, extract it first and select the folder containing `manifest.json`. Pin the extension. Refresh existing Maps tabs after installing or reloading it.

The application creates a downloadable ZIP during `bun run dev` and `bun run build`; regenerate it directly with `bun run extension:build`. The archive includes only the runtime files, not tests, environment files, or dependencies. It is an internal unpacked extension, not a Chrome Web Store release.

## Collect and import

1. Search Google Maps or open a single business profile. Tested on English Maps, including the separate hotel layout. The manifest supports `www.google.com/maps`, `www.google.co.in/maps`, and `maps.google.com`.
2. Open the extension, choose a total collection limit (20/50/100), and start. Keep the Maps tab open; the popup can close. Stop waits for the current check to exit and keeps collected records.
3. Records are saved in extension-local storage. They survive popup closure and page reloads. Only one Maps tab can collect at a time. Starting again resumes the saved collection; increase its total limit or clear it to start a new one.
4. Enter your Qublox workspace origin, e.g. `http://localhost:3001` or `https://sales.your-domain.com`. Select **Send to Qublox** and grant access to that destination when Chrome asks.
5. The extension opens Qublox. Sign in if necessary, review the incoming collection, choose an offer, and select **Confirm import**. No prospect is written automatically, and the extension never receives your login cookie, password, or Gateway key.
6. Export JSON or Excel-compatible UTF-8 CSV at any time when collection is stopped. Clearing the extension collection does not delete imported prospects.

The current pipeline requires a website. Places without one stay in the collection/export and appear as missing in the import preview. Add their actual website in the preview JSON, or import the other valid rows; invalid rows are reported separately. Collected emails/phones are not verified.

## Hotel fixes

- Prefer the business heading over Sponsored/ad headings, and scope contact extraction to that detail pane.
- Read only explicit business website/phone/review fields. Booking providers, nightly prices, and unrelated numbers are not contact information.
- Match details by place identity plus heading/content changes; same-name branches are retained and stale panels are not copied into another business.
- Deduplicate by Maps identifier, retaining CID and ignoring tracking parameters. Search terms embedded in navigation URLs do not become place IDs.
- Re-discover visible cards by identity after each interaction. Overlapping scroll increments handle virtualized lists whose card count stays constant.
- If a detail pane cannot be matched, retain a clearly labeled **list-only** record rather than copying another business’s details. That warning becomes a prospect note on import.

Maps can change its DOM, delay details, or restrict results. The collector works with the visible DOM; it does not bypass sign-in, CAPTCHA, or access restrictions. A saved `detail` status means the visible pane was matched, not that Google’s information or the website mailbox was independently verified.

## Transfer and permissions

Required permissions are `activeTab`, `scripting`, and `storage`, plus the listed Maps hosts. Workspace access is optional and requested only for the origin you enter. The optional HTTPS pattern permits selecting your own VPS hostname; it does not grant every HTTPS site at install time.

The worker opens the chosen workspace and injects an isolated bridge there after checking its exact origin. The injected function checks the intended origin again so a racing navigation cannot send the batch elsewhere. The bridge offers a nonce-based batch for up to 15 minutes, including across a login navigation. The app checks the message origin/source/nonce, validates the bounded payload, and displays an editable preview. Confirmation uses the normal authenticated `/api/imports` endpoint. Record data is not placed in the URL. If you leave the preview or it expires, resend; the saved collection remains in the extension.

## Verification

Run `bun test apps/maps-extension/tests`. Captured hotel list/detail fixtures came from a public Amritsar hotel search and the original supplied hotel snippet. Scripts, image resources, opaque telemetry attributes, and tracking query parameters were removed. Tests reproduce the original wrong Sponsored name, false booking contacts, lost CID identity, and virtualized-card skipping; they also cover real hotel contacts, stale/same-name panels, persistence, transfer boundaries, CSV formulas, and archive contents.

The available in-app browser cannot load unpacked Chrome extensions. Production collector code is exercised against captured live DOM in a VM, Chrome APIs are simulated for deterministic worker tests, and the Qublox preview is checked in a real browser. Native unpacked-extension installation and permission prompts still need a smoke check in your Chrome/Brave profile; no claim is made that VM tests replace that check.

Chrome references: [content scripts and isolated worlds](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions), [script injection](https://developer.chrome.com/docs/extensions/reference/api/scripting), and [storage](https://developer.chrome.com/docs/extensions/reference/api/storage).
