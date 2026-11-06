# Website scraper hit rate (6 November 2026)

Sample: 20 real small-business websites found by web search (Amritsar hotels, Pune dental clinics, Indian Shopify fashion labels, cafes, small agencies). The list is in `scraper-sample-sites.json`. Re-run with `bun run research:sample`. It is read-only HTTP, respects robots.txt and contacts nobody.

| | Before | After |
|---|---|---|
| Pages readable | 14 | 19 |
| Email found | 9 (45%) | 14 (70%) |
| Email or phone found | 14 | 17 (85%) |
| Junk or merged emails | 5 | 0 |

Fixes that moved the numbers:

- Pages over 512 KB failed outright; five modern themes did. The cap is now 3 MB, and larger pages are read up to that point instead of failing.
- Adjacent text was merged (`info@cafebengaluru.inphone`, `usbespokdentalpune@gmail.com`). Tags are now spaced before text extraction.
- New sources: Cloudflare-protected emails, schema.org JSON-LD `email`/`telephone`, `name [at] site [dot] com`, and `wa.me` / `api.whatsapp.com` links.
- Theme placeholders (`you@gmail.com`, `support@gmail.com`), asset names (`logo@2x.png`) and tracking domains are dropped. Business-domain inboxes rank first; `hr@`, `careers@` and `noreply@` rank last.
- Contact pages are visited first; when the homepage has neither an email nor a contact link, `/contact`, `/contact-us` and `/pages/contact` are tried.

Remaining misses: one site disallows crawlers in robots.txt (respected), two Shopify stores render contact details with JavaScript or only offer a form, and two sites list only a phone. A headless browser fallback (Playwright) would recover some JavaScript-rendered pages; it is feasible on a 2 GB VPS at this volume but is not built. Emails remain unverified until a mailbox check is added.

Small sample, one day, one network. Treat these as directional, not a benchmark.
