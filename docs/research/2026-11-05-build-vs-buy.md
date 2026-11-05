# Qublox sales: build versus buy

Research date: **5 November 2026**, India time.

## 1. The decision

**Build a small research-and-review assistant. Buy narrowly where you need external data or email infrastructure. Do not begin by recreating an entire outbound platform.**

Qublox can build a useful version of most of the proposed workflow. You do not need Apify, Clay, Apollo, Instantly, or a paid CRM merely to start selling. However, writing a waterfall does not recreate the databases behind it; writing an SMTP client does not recreate a reputable mail service; and writing a browser scraper does not guarantee sustained access to every website.

Your actual business is broader than the e-commerce example: websites, custom applications, SaaS implementation, internal tools, integrations, automation, and AI features. Keep that breadth in the company's capabilities, but choose **one buyer group and one offer per campaign**. Otherwise the system cannot distinguish a useful sales signal from an interesting fact.

Recommended starting point:

- **10–20 new, researched businesses per week**, around 40–80 in a four-week pilot. This is a planning recommendation, not a forecast of conversions.
- One primary campaign, one salesperson, one contact owner per business.
- Start with referrals, existing relationships, and businesses explicitly requesting help. Add a small, lawful cold-outreach test only through an appropriate sending route.
- Import URLs manually, through JSON/CSV, or from a permitted directory. Use your existing extension as a technical starting point, subject to the Maps restrictions discussed below.
- Extract a few relevant public website pages, attach evidence, score the opportunity, draft, and have Sayam review it.
- Send and handle replies manually initially. Automate only the steps that demonstrably consume time.

**Initial purchases:** none are essential for research and drafting if you already have a computer and use free allowances or local models. Branded mail hosting is useful for ordinary business correspondence. For unsolicited email, provider permission is a separate requirement; personal Gmail rotation is not a dependable free substitute.

## 2. Scope and strength of evidence

This report uses official product pages, documentation, provider policies, regulator guidance, and the local extension source. Product prices were checked on the research date. Some pages contain inconsistent pricing, so those entries are explicitly qualified.

I inspected `/Users/ashwath/Code/google-maps-scrapping-extension`. The `qublox-sales` workspace was empty. The extension contains both the scraper and its popup; I did not identify a separate Maps scraper project in the directory inventory or filename searches. A differently named implementation could still exist.

I checked JavaScript syntax and reproduced three extension failure cases in an isolated Node VM. **I did not run a live Maps scrape, benchmark paid APIs, send outreach, create accounts, buy subscriptions, or independently measure vendors' accuracy or inbox placement.** Capability assessments, engineering effort, pilot targets, and purchase thresholds below are my estimates or recommendations, not observed production results.

The user's “60% of the core” criterion is sensible if it means a narrower useful outcome. It should not be interpreted as a measured percentage of a vendor's coverage. A scraper that works on 60% of sites still needs an explicit failed/unknown state for the rest.

## 3. Build/buy decisions by feature

| Capability                        | A useful version you can build                                          | Hard part that remains                                              | Starting decision                                                  |
| --------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Niche and location sourcing       | Saved searches, manual URL entry, directory imports, deduplication      | A current, broad index of businesses                                | Manual/import first; buy discovery only after measuring a gap      |
| Public website scraping           | Fetch HTML, extract contacts and structured data; render selected pages | Blocked pages, login walls, unusual sites, maintenance              | Build with existing open-source libraries                          |
| Social context                    | Save profile links and manually capture relevant public evidence        | Reliable access, platform permissions, freshness                    | Manual supplement; optional provider for specific missing evidence |
| Shopify/WooCommerce detection     | Small rule set with confidence and evidence                             | Headless stores and hidden/private systems                          | Build; return unknown when evidence is weak                        |
| Products and aesthetic            | Visible product details, screenshots, simple visual notes               | Real sales numbers and objective conversion impact                  | Build observed context; qualify inferred claims                    |
| Waterfall logic                   | Ordered providers, caching, budgets, stop conditions                    | Contact data, licensing, API access                                 | Build orchestration; use one provider at a time initially          |
| Email verification                | Syntax, DNS, domain checks                                              | Mailbox existence, catch-alls, blocked checks                       | Use a specialist's free allowance, then a small credit purchase    |
| Signal scoring and drafting       | Evidence-based rubric plus LLM or human drafting                        | Good offer, factual grounding, evaluation                           | Build; retain manual review                                        |
| Split-screen review               | Evidence pane, draft pane, edit/approve/regenerate                      | Good workflow, reliable state changes                               | Build a thin version after proving the manual workflow             |
| Account assignment and scheduling | Sender ownership, queue, caps, retries, timezone windows                | Provider acceptance and sender reputation                           | Defer rotation; add a basic queue when needed                      |
| Copy variants                     | Two or three reviewed versions                                          | Actual relevance and delivery quality                               | Build if useful; do not treat as spam-filter protection            |
| Dynamic images                    | Composite screenshot/logo/text using a template                         | Proving that images help sales                                      | Defer; manually create for exceptional opportunities               |
| Reply categorization              | Rules, then a small classifier                                          | Mail integration, accurate thread matching, sensitive data handling | Manual labels first                                                |
| Multi-client master inbox         | Provider adapters, thread storage, access controls                      | OAuth, sync failures, security, tenant separation                   | Buy later or build only when the workload warrants it              |

The reusable advantage is **your offer-specific evidence, reviewer decisions, and results**. Generic scheduling and templating are comparatively easy to replace.

## 4. Corrections to the original feature claims

### Rotation and spintax do not guarantee delivery

“500 messages permanently blacklist the domain” is not a deterministic rule. “25 per inbox bypasses filters completely” is also false. Gmail publishes sender authentication and reputation requirements, including a reported spam-rate ceiling of 0.3%; neither rotating accounts nor changing synonyms replaces those requirements. Use SPF, DKIM, and DMARC for a domain you control, and monitor actual failures and recipient feedback. These controls improve legitimacy; they do not guarantee inbox placement. [Google sender guidelines](https://support.google.com/mail/answer/81126?hl=en-en)

Consumer Gmail documents a limit around 500 messages/day; paid Workspace documents up to 2,000 messages/day with important account and sending-method exceptions. Those are technical ceilings, not recommended outreach volumes or permission to send unsolicited messages. [Consumer limits](https://support.google.com/mail/answer/22839?hl=en), [Workspace limits](https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace)

Gmail's current program policy prohibits spam and unsolicited commercial mail. Even a manual or small campaign must be assessed against the provider's terms. A reseller or sequencing product does not override the underlying mailbox provider's rules. [Gmail program policy](https://support.google.com/mail/answer/16734397)

### Finding an address is different from verifying it

A published email is evidence of a contact route. A provider's verified result is a technical deliverability estimate. Neither establishes that the person is the right buyer or that sending is permitted. An MX record concerns the domain's ability to receive mail, not whether a particular mailbox exists. Catch-all systems can accept checks for nonexistent addresses; some systems block checks entirely. [Hunter verification checks](https://help.hunter.io/en/articles/1935168-what-checks-are-performed-on-an-email-with-the-email-verifier), [Hunter API result definitions](https://hunter.io/api-documentation)

### Personalization and buyer intent are different

“Uses Shopify,” “has a minimalist aesthetic,” or “appointed a new CMO” can help frame a message. These do not prove an active purchase project. Stronger evidence includes a relevant request for a developer, a current integration requirement, an explicit procurement notice, or a business describing a problem you can solve. A newly detected technology is not necessarily newly installed; you need a previous observation to establish a change.

### A missing email does not authorize an automated Instagram DM

Meta's official Instagram API collection says the message recipient must already have messaged the professional account. The standard messaging API is not a general cold-DM endpoint. Use a **manual review task** for an appropriate profile rather than promising automatic cold delivery. Other API entry points have their own rules and are not a blanket exception. [Meta's official Instagram API collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-56730cef-8d38-4f1a-8cc3-54444b625e7c)

## 5. What to sell first, and how that changes sourcing

Treat these as candidate experiments, not claims about guaranteed demand or market size:

| Campaign                  | Buyer                                      | Useful public evidence                                                   | Small initial offer                        | Discovery route                                                                         |
| ------------------------- | ------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------- |
| Website and enquiry flow  | One kind of local service business         | Active business, weak or missing website, awkward enquiry path           | A defined website/enquiry improvement      | Referrals, business-owned sites, permitted local directories; Maps for manual discovery |
| E-commerce improvement    | Small established store in one category    | Specific product/navigation issue; explicit requested integration        | One storefront fix or small integration    | Search, brand websites, manually reviewed social profiles                               |
| Operational automation    | Small agency or service company            | Public job/request describing repetitive reporting, intake, or data work | One workflow with a clear input and output | Personal network, public requests, relevant communities                                 |
| AI feature implementation | Company already seeking a concrete feature | A stated support/search/document-processing requirement                  | Bounded integration with a human fallback  | Relevant job/project postings and introductions                                         |

For the first month I would choose **one local-business website/enquiry campaign** if you need the quickest route to conversations and can show relevant work. If you already have stronger e-commerce proof, choose that instead. Keep automation and AI as separately targeted campaigns; do not infer an internal workflow problem solely from a public homepage.

Split the pilot approximately 75% India and 25% US if you can handle US business hours and demonstrate credible delivery. This allocation is a recommendation for learning, not evidence that one country converts better. Use separate results by market. Western budgets can be larger, but trust, proof, communication, and competition also matter; this research does not establish that overseas prospects will be easier to close.

Do not spend weeks choosing a niche through software. Ten real conversations about one defined offer will reveal things a technology detector cannot.

## 6. Existing Maps extension: what is reusable

### What the code already does

The extension is a small Manifest V3 browser implementation. It locates Maps result cards, clicks them, waits for the details panel, reads business name/phone/website/address/rating/review count, deduplicates URLs during the page session, scrolls for more, reports progress, and exports CSV or JSON.

Relevant source:

- [Manifest and permissions](/Users/ashwath/Code/google-maps-scrapping-extension/manifest.json:1)
- [Detail-panel wait](/Users/ashwath/Code/google-maps-scrapping-extension/content.js:79)
- [Extracted record](/Users/ashwath/Code/google-maps-scrapping-extension/content.js:350)
- [Scraping loop](/Users/ashwath/Code/google-maps-scrapping-extension/content.js:440)
- [Export helpers](/Users/ashwath/Code/google-maps-scrapping-extension/content.js:545)
- [Popup controls and messaging](/Users/ashwath/Code/google-maps-scrapping-extension/popup.js:1)

This is a sensible prototype for attended extraction. It does not yet crawl business websites, find emails, detect tech, capture screenshots, enrich contacts, or send messages. Its “Excel” export is UTF-8 CSV with a BOM, not an XLSX workbook. An `extractCategory()` function exists but is not included in the exported record.

### Findings and verification

Both JavaScript files passed `node --check`. The following results came from synthetic checks against the existing class, with the DOM and navigation stubbed; they demonstrate the code paths, not their frequency on today's Maps UI.

| Finding                                    | Evidence                                                                     | Consequence                                             | Fix direction                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| Virtualized list can lose new businesses   | A/B cards replaced by C/D with the same list length; only A/B were processed | Visible-card index is not a stable cursor               | Process unseen place identities each pass                           |
| Same-name branches are skipped             | Two distinct place URLs with the same displayed name; second returned false  | Chain branches and repeated names can disappear         | Validate panel identity against target place/URL, not name changes  |
| Review fallback can read unrelated numbers | A DOM containing an unrelated numeric span `250` returned `250` reviews      | Bad evidence enters scoring                             | Scope to validated rating/review elements; otherwise return unknown |
| State is only in page memory               | Arrays and sets in the content-script instance; no durable storage           | Refresh/navigation loses collected state                | Checkpoint records and run progress locally                         |
| Loose global fallbacks                     | First matching external link, phone-like text, or number can be accepted     | Wrong fields may be attributed to a business            | Scope extraction to the selected panel and record confidence        |
| CSV escaping does not neutralize formulas  | Cells are quoted but `=`, `+`, `-`, `@` prefixes are not handled             | Spreadsheet apps may interpret untrusted scraped values | Prefer JSON import; provide an explicitly spreadsheet-safe export   |

The current implementation also uses several English labels and fragile CSS classes. It can stop after three apparent scroll failures. It acknowledges “started” before the asynchronous start path proves there is a feed. These are useful hardening targets, not reasons to throw away the project.

### Reuse plan

1. Keep its JSON record as an import source and preserve `url` and `scrapedAt`.
2. Add business identity, source URL, query, location, and field-level confidence; normalize domains separately from source URLs.
3. Add durable checkpoints, unseen-identity traversal, and target-panel validation.
4. Build website research as a **separate module** in this workspace. A Maps content script cannot simply fetch arbitrary business websites without new permissions and cross-origin considerations.
5. If useful, evolve the browser extension into a user-invoked capture tool for a business-owned page: website, selected evidence, and screenshot. That attended research pattern is more broadly reusable than Maps-specific DOM selectors.

Estimated engineering effort: **1–3 focused days** for the main reliability fixes and import contract, followed by a live sample check. This is an estimate, not a commitment; Maps changes could expand it. No extension source was changed during this research.

### Technical feasibility does not settle Maps usage rights

Google's Maps end-user terms restrict copying and mass downloading. Maps Platform terms also restrict extraction and reuse; the Places API has storage and attribution restrictions, while place IDs have a specific storage exception. Therefore neither “our extension works” nor “Apify sells this” establishes permission to build a permanent lead database from Maps content. An official API is not automatically an unrestricted export license. [Maps end-user terms](https://maps.google.com/help/terms_maps/), [Maps Platform terms](https://cloud.google.com/maps-platform/terms), [Places API policies](https://developers.google.com/maps/documentation/places/web-service/policies)

My recommendation is to retain the code for evaluation and reuse its attended extraction patterns, while making business-owned pages, permitted directories, and appropriately licensed data the durable evidence sources. Keep Maps-origin data distinguished from independently sourced website data.

## 7. Scraping: can you build enough to avoid Apify?

**For ordinary public business websites: probably yes, with a narrow definition of success. For reliable unattended access to arbitrary social profiles: do not assume so.** A measured pilot must establish the actual coverage.

Use a cascade instead of launching a browser for every page:

1. Fetch the homepage with an ordinary HTTP client. Enforce timeouts, response-size limits, redirect checks, and low per-host concurrency.
2. Parse visible text, `mailto:` links, structured JSON-LD, canonical URL, contact/about links, and social links. Keep useful page content rather than only generic “readable article” text, which may discard commerce details.
3. Follow at most a small handful of relevant pages: contact, about, services, product/collection, and a page related to the campaign signal. Do not crawl an entire catalogue by default.
4. Use Playwright only when rendering is necessary or a screenshot is worth the extra processing.
5. Mark blocked, login-required, timeout, and insufficient-content results explicitly. Use a manual task or optional paid fallback for important cases; do not repeatedly hammer inaccessible pages.

**TypeScript option:** Crawlee plus an HTML parser and Playwright. Crawlee already supplies HTTP/browser crawlers, persistent queues, retry handling, and screenshot-capable browser integration. You can use it locally without buying Apify hosting. [Crawlee documentation](https://crawlee.dev/js/docs/introduction)

**Python option:** a conventional HTTP/HTML parser stack, with Crawl4AI or Playwright where useful. Crawl4AI's repository is Apache-2.0 and supports self-hosting. Pick one language for the worker based on team familiarity; there is no need to introduce both simply because the team can use both. [Crawl4AI repository](https://github.com/unclecode/crawl4ai)

**Hosted fallback:** Firecrawl can save integration and rendering time. Its basic page credits and extraction features have different costs; use the correct endpoint in cost estimates. Apify provides hosted execution and maintained Actors; actor-specific charges and add-ons matter independently of the platform subscription. [Firecrawl pricing](https://www.firecrawl.dev/pricing), [Apify pricing](https://apify.com/pricing)

Never treat fetched page text as instructions to the agent. It is untrusted evidence. A worker fetching user-entered URLs must block private/local network destinations and recheck redirects; screenshots/HTML should be displayed safely. These are directly relevant protections for this product, including when it starts as an internal tool.

### What information can the crawler actually establish?

| Desired field           | Cheap useful method                                                          | What you must not overclaim                                                                 |
| ----------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Store/platform          | Multiple HTML/script/asset/cookie clues; record exact evidence               | A private backend framework, an exact subscription plan, or “Shopify Plus” from a weak clue |
| Product catalogue       | Public product pages and JSON-LD; a permitted public endpoint if available   | That every store exposes the same endpoint or complete catalogue                            |
| Best-selling products   | Store-labelled best sellers; native collection order when clearly identified | Units sold, revenue, recent velocity, or verified sales ranking across all platforms        |
| Aesthetic               | Screenshot, dominant colors, typography and image style observations         | That visual style proves poor sales or a need to redesign                                   |
| Performance             | Repeatable measurement with device/network context                           | That one lab result proves lost revenue                                                     |
| Integration opportunity | Public feature gap, explicit request, or confirmed workflow                  | Hidden operational pain, budget, or buyer authority                                         |
| Social context          | Linked profiles and manually checked relevant posts                          | Guaranteed access to arbitrary profiles or complete history                                 |

Shopify documents a best-selling sort based on the all-time number of orders including a product. Some stores expose that sort; storefront customization and catalogue context still matter. Record “shown in best-selling order on this collection,” not “their highest-revenue product.” A collection named “Best Sellers” can also be curated. [Shopify collection sorting](https://help.shopify.com/en/manual/products/collections/collection-layout)

Detect only a small set of useful technologies at first: Shopify, WooCommerce/WordPress, common site builders, and explicitly visible booking/contact systems. BuiltWith offers free individual lookups; Wappalyzer offers a limited free allowance. Their paid indices buy discovery and coverage beyond a few rules, not merely the ability to see a Shopify script tag. [BuiltWith plans](https://builtwith.com/plans), [Wappalyzer plans](https://www.wappalyzer.com/pricing/)

## 8. Contact discovery and waterfall enrichment

For 40–80 prospects/month, use a **small, evidence-first waterfall**, not five paid subscriptions:

1. Check business-owned contact/about/team pages and explicit business contact links.
2. Determine whether the address belongs to the business and whether it reaches the likely buyer. A general inbox can be useful for a small owner-led business; a support address may be a poor route to an enterprise buyer.
3. For a high-fit lead still missing contact information, use one finder's legitimate free allowance or manually look up an appropriate published professional contact.
4. If a candidate address is found, retain source, date, person/role where known, and verification status.
5. Use a second finder only for unresolved, valuable leads and measure its **additional** usable results.
6. If no appropriate verified route exists, create a manual research task, use a permitted alternative channel, or skip. Do not guess a Gmail address from a person's name.

Keep result states separate: `published_unverified`, `verified`, `accept_all`, `unknown`, `invalid`, `no_result`, and `provider_error`. A provider outage is not “no email exists.” A catch-all address is not a verified individual mailbox. Route uncertain results to review instead of relabelling them to improve the apparent match rate.

The waterfall itself needs little code: sequential adapters, normalized outcomes, a per-lead cost cap, a global budget, caching, provenance, and stop rules. **The data and verification infrastructure are the paid value.** Database agreements may also restrict resale and use; building the wrapper does not transfer ownership of their data.

Hunter's plans distinguish all-in-one credits from API-focused Data Platform balances. Its help documentation lists different charges for finding, domain search, and verification; do not calculate costs by equating every credit to one verified contact. Finder verification can already be included, so avoid paying to verify the same fresh result twice without a reason. [Hunter credit rules](https://help.hunter.io/en/articles/1911617-how-do-credits-work-in-hunter), [Hunter finding and verification FAQ](https://help.hunter.io/en/articles/15921145-faqs-about-finding-emails-in-hunter)

### What you should build versus outsource in verification

Build syntax normalization, domain/DNS checks, duplicate removal, role-address tagging, freshness rules, and a suppression list. Do not try to recreate a full mailbox-verification service in the first version. Catch-alls, throttling, SMTP blocking, provider behavior, and data freshness are where simple scripts become misleading.

Start by testing Reoon's daily free allowance against a second provider on a small sample you have permission to use. Its stated allowance is up to 20 daily checks, with renewal conditions; it is not a bank of 600 credits available all at once. If successful, a 10,000-credit pack is a small one-time option. A provider's claimed accuracy is not an independently verified result for Qublox's leads. [Reoon verifier and pricing](https://www.reoon.com/email-verifier/)

### How to measure whether a second database is worth buying

Example assumptions: 100 candidate businesses; 30 appropriate emails found from their own websites; provider A finds 20 more; provider B finds 6 additional appropriate contacts.

Compare B's **incremental six**, not the total 56. If B costs $39/month, that is $6.50 for each additional usable contact before considering review time and outcomes. Those numbers are illustrative, not predicted match rates.

Use:

`incremental acquisition cost = incremental provider cash + review-time cost`

`cost per additional usable contact = incremental acquisition cost / net new usable contacts`

Also check whether the six are decision-makers, whether they were recently verified, and whether the outreach route is permitted. High nominal coverage can be commercially useless.

## 9. Scoring and drafting that fit Qublox

Keep four separate judgments: **business fit, strength of evidence, relevance to the offer, and contactability**. The proposed 0–3 personalization score can summarize the hook, but should not pretend to measure purchase intent.

| Score | Meaning                                                                       | Handling                                   |
| ----- | ----------------------------------------------------------------------------- | ------------------------------------------ |
| 0     | No supported, offer-relevant observation                                      | Do not generate a generic cold pitch       |
| 1     | Basic relevant fact, weak connection to a need                                | Manual review or short additional research |
| 2     | Specific observation plausibly connected to the chosen offer                  | Draft for human review                     |
| 3     | Specific observation plus corroborating evidence or explicit relevant request | Prioritize for human review                |

Separate `research_incomplete` from score 0. A blocked website is not evidence that the business lacks a good opportunity. Similarly, a well-designed site with a public automation request may be a strong lead for automation and a weak lead for redesign.

Each scored claim should include a URL, short supporting excerpt, observation time, confidence, and whether it is observed or inferred. The draft should link back to evidence in the review UI. Reject claims about revenue, conversion losses, internal systems, or recent changes that the evidence cannot support.

An offer brief should include buyer type, target problem, deliverable, proof Qublox can show, exclusions, and next step. “We build everything in tech” should remain an internal capability statement; it is not a useful base pitch for every lead.

Example structure, using **hypothetical** evidence:

> I found the workshop registration instructions on your events page. They ask attendees to email three separate details. We build small registration flows that collect those fields in one place and give your team a simple attendee list. Would a short example be useful?

The useful personalization is the connection between an observed flow and a bounded service. Do not invent that flow for a real prospect. Add appropriate sender identity, address, and opt-out wording for the applicable market and provider.

### AI options and real cost

**Updated with the team's existing resources:** Qublox already has Merge Gateway access with $10 of monthly LLM credits. Use that as the initial hosted-model route rather than buying another subscription. Merge publishes monthly complimentary Pro credits and provider-cost-plus-fee pricing; enforce a budget within the existing allowance. No additional LLM spend is expected for the small text-first pilot, subject to the selected model and measured usage. [Merge Gateway pricing](https://www.merge.dev/pricing/gateway), [Gateway cost documentation](https://docs.merge.dev/merge-gateway/cost/pricing)

Extract obvious emails/phone numbers with deterministic parsing first. Use the inexpensive model for ambiguous context, structured extraction from relevant snippets, scoring, and drafting. Do not send entire minified JavaScript bundles by default or assume the cheapest model will always extract correctly. Require source evidence and allow an unknown result. Approved email sending may be manual or use provider-supported SMTP/API; manual Instagram handling is acceptable. Neither automated nor manual email sending guarantees inbox placement.

Use human drafting first if it takes only a few minutes. For automation, benchmark a small local model through Ollama against an inexpensive hosted model. Ollama supports local execution without a cloud API key; hardware, speed, model license, and output quality still matter. [Ollama quickstart](https://docs.ollama.com/quickstart)

The checked Gemini pricing page lists Gemini 3.5 Flash-Lite at **$0.30 per million input tokens and $2.50 per million output tokens**, with a free tier subject to limits. Free and paid data-use terms differ. Public-site extraction can still contain personal information, so minimize what you send and use suitable terms for private reply content. [Gemini pricing](https://aistudio.google.com/docs/pricing)

Illustrative text-only workload: 80 businesses × 6,000 total input tokens and 800 total output tokens per business, across scoring and drafting. That is 480,000 input and 64,000 output tokens, approximately **$0.304** at those rates. At 1,000 businesses it is approximately **$3.80**. Extra thinking tokens, retries, screenshots, larger context, and search/tool calls can increase costs. A $5 pilot spending cap is a budget control, not an expected invoice.

There is little reason to spend days optimizing fractions of a dollar while a reviewer spends hours fixing inaccurate drafts. Never buy a GPU for this pilot merely to avoid a tiny API bill.

## 10. Email sending: what can be recreated?

### The three different layers

1. **Mailbox infrastructure:** the account/domain/server that accepts and transmits mail.
2. **Campaign software:** queues, follow-up timing, account assignment, opt-outs, reply detection, and reporting.
3. **Recipient acceptance:** authentication, reputation, relevance, recipient behavior, and filtering outside your control.

You can build layer 2. You cannot guarantee layer 3 by building more of layer 2. You can technically self-host layer 1, but doing so transfers administration and reputation work to you.

### Practical routes

| Route                                                                                        | Cash implications                          | Assessment for Qublox                                                              |
| -------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| Existing account for expected correspondence, introductions, replies, or requested proposals | No additional account cost                 | Best starting route where its terms allow the communication                        |
| Multiple personal Gmail accounts for unsolicited campaigns                                   | Looks free                                 | Do not make this the foundation; Gmail policy and recipient acceptance still apply |
| Branded business mailbox                                                                     | Mailbox subscription plus domain if needed | Useful for business identity; confirm intended sending use separately              |
| Provider explicitly supporting lawful B2B outreach                                           | Mailbox charges and possible minimums      | Reasonable cold-email infrastructure candidate after qualification                 |
| Sequencer such as Smartlead/Instantly on top of mailboxes                                    | Additional subscription                    | Defer until follow-ups/replies are hard to manage manually                         |
| Transactional/permission email API                                                           | Low apparent per-message cost              | Not interchangeable with cold-outreach infrastructure                              |
| Self-hosted mail server                                                                      | Server/domain plus operating time          | Technically possible; poor first-revenue priority                                  |

Zoho Mail's usage policy excludes promotional, bulk/mass, marketing, and automated emails among other categories. Resend explicitly prohibits cold outreach and scraped-contact sending. AWS prohibits unsolicited mass email; Brevo prohibits importing purchased and scraped lists. These restrictions differ in scope, but all matter more than a low headline price. [Zoho policy](https://www.zoho.com/mail/help/usage-policy.html), [Resend AUP](https://resend.com/legal/acceptable-use), [AWS AUP](https://aws.amazon.com/aup/), [Brevo list policy](https://help.brevo.com/hc/en-us/articles/213405965-Build-a-legitimate-contacts-database-for-optimal-deliverability-and-compliance)

Among providers checked, Mailforge's terms explicitly permit lawful unsolicited B2B outreach where local law permits it, require verified recipients, and require an unsubscribe link. Its mailbox infrastructure can be used separately from the Salesforge sequencer. This is a **policy-compatible candidate**, not an inbox-placement endorsement. [Mailforge sending terms](https://www.mailforge.ai/terms)

### If you build the small sending layer later

Use a provider-supported SMTP/API connection, a persistent outbox, and stable contact ownership. A follow-up should remain with the same sender. Count follow-ups and replies against applicable account budgets; aliases do not become independent mailboxes merely because the From address changes.

For a tiny pilot, distribute 10–20 new contacts across the week. That is workload planning, not a “safe spam-filter limit.” Send one useful follow-up after roughly a week if appropriate, then stop unless there is engagement. Stop queued follow-ups on any reply pending human review, opt-out, hard bounce, or relevant account problem.

Before each send, recheck suppression, reply state, approval, recipient, and sender. An approval should identify the exact recipient, channel, and draft version; editing or regeneration invalidates it. After an ambiguous send timeout, reconcile with provider/Sent state before retrying. A duplicate sales email is a real customer-visible failure.

Put bounced and opted-out contacts on a shared Qublox suppression list across campaigns and senders. Prevent simultaneous campaigns from contacting the same business without review. Keep the core business domain's important correspondence in mind when choosing infrastructure; separate domains are not a reputation reset or a license to ignore feedback.

Skip automated warm-up networks initially. Vendor inclusion of a warm-up feature is not independent evidence that fabricated exchanges improve this pilot. Use truthful identity, relevant communication, and observed delivery outcomes. Open/click tracking also adds complexity and produces noisy signals; prioritize actual replies, qualified conversations, and paid work.

### Why not self-host SMTP?

An SMTP library is straightforward. A dependable mail service needs DNS, TLS, reverse DNS where applicable, queues, abuse handling, bounce processing, security updates, IP reputation, backup, and compatible hosting terms. A cheap VM does not imply good delivery. At your volume, using an appropriate provider or a non-cold acquisition route is likely a better trade than owning a mail server. This is an engineering/economic judgment, not a claim that self-hosting is impossible.

## 11. Review dashboard, visuals, and master inbox

### Split-screen review: build the narrow workflow

Initially, a local page or simple internal app can show evidence on the left and an editable draft on the right. Make unknown fields obvious. Include source links, capture times, screenshot, chosen offer, contact confidence, and a short score explanation. Provide edit, approve, reject, research-more, and regenerate.

“Approved” should mean ready for a defined next action. Keep **approved**, **queued**, and **sent** separate. For manual sending, open the mail client or copy the reviewed text and record the actual send result. Do not label a prefilled compose window as a sent email.

For the first experiment, you can accomplish this in a spreadsheet plus evidence notes and a mail client, without building the full UI. Build the UI when evidence lookup and copy/paste are slowing review.

### Dynamic images: easy core, uncertain value

Screenshot/logo/text compositing can be built with ordinary image libraries or browser-rendered HTML. You do not need a paid dynamic-image service for a few proposals. A personalized mini-audit or relevant before/after mockup may be useful for an especially valuable opportunity, but prove its value before generating one for every lead. Clearly identify mockups as concepts, and do not imply the prospect is already a client or endorses Qublox.

The first message can remain short and plain. Save heavier proof for a response or a prospect who requested it. No measured uplift from dynamic imagery was established in this research.

### Master inbox: categorization is easier than mail integration

At 40–80 new prospects/month, native mail labels and a shared activity log should be enough. Add categories such as interested, question, referral, not now, out of office, opt-out, bounce, and unknown. “Can you send details?” is not a booked meeting. Confirm bookings using an actual calendar event or human confirmation.

If you later ingest replies, process headers and delivery reports with deterministic rules, then classify the remaining content. Allow multiple labels: a person can ask a question and opt out. Stop follow-ups before attempting an AI response. Send ambiguous classifications to a person.

For Gmail, `gmail.send` is sensitive, while read/compose/modify scopes are restricted. Public applications using restricted scopes can face verification and security-assessment requirements when transmitting or storing restricted data; internal/personal use may qualify for exceptions that must be checked for the actual setup. This is a reason to defer broad multi-client inbox integration. [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)

An external OAuth app left in Testing can receive seven-day refresh tokens for these scopes. Changing a setting is not a substitute for meeting applicable verification requirements. Gmail synchronization also requires handling expired history and full resyncs. These are operational details a simplistic “read all inboxes” feature leaves out. [Google OAuth token expiry](https://developers.google.com/identity/protocols/oauth2/), [Gmail synchronization](https://developers.google.com/workspace/gmail/api/guides/sync)

Never forward all of someone's personal inbox into Qublox merely to obtain sales replies. Prefer dedicated business accounts, narrow access, encrypted secrets, and limited storage. A future multi-client product needs tenant isolation; this internal pilot does not need to become that product now.

## 12. Vendor options and verified pricing

All prices below are USD, before tax unless specified. A monthly equivalent on an annual contract is **not** a month-to-month price. These are shortlisted options, not an exhaustive global cheapest ranking. No vendor's reliability or “99% accuracy” marketing was independently validated.

### Scraping, search, and business discovery

| Option                   | Checked price/allowance                                                                    | What it buys                                                                                        | Decision                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Crawlee, local           | Free open-source software                                                                  | Crawler building blocks; your compute and maintenance remain                                        | Preferred TypeScript starting point                                 |
| Crawl4AI, self-hosted    | Apache-2.0 project                                                                         | Python crawler/extraction building blocks                                                           | Reasonable Python alternative                                       |
| Apify                    | $5 monthly free usage; Starter $19/month with $19 usage included, then overage             | Hosted execution and Store Actors; Actor billing varies                                             | Use free/sample runs before subscribing                             |
| Apify Compass Maps Actor | Advertised **from $1.50/1,000 places**                                                     | Maps extraction; plan discounts and enrichment add-ons affect price                                 | Obtain run-specific price; do not model this floor as the full bill |
| Firecrawl                | 1,000 free monthly credits; Hobby $19/month or $16/month billed annually for 5,000 credits | Hosted scraping/search; basic scrape is generally 1 credit/page; enhanced extraction can cost extra | Useful selective fallback                                           |
| Serper                   | 2,500 free queries; $50 top-up for 50,000 queries, valid six months                        | Search results to help find candidate sites                                                         | Free allowance can cover a pilot; minimum top-up matters            |
| DataForSEO               | SERP pricing from $0.0006/result page, with endpoint/mode differences; $50 minimum top-up  | Search/Maps/search-adjacent data                                                                    | Low unit price, unnecessary cash commitment at tiny volume          |
| Store Leads              | Premium $75/month for UI; Pro $250/month includes exports and API                          | E-commerce index, filters, and technology data                                                      | Relevant only after an e-commerce campaign proves worthwhile        |
| BuiltWith                | Free individual lookup; Basic $295/month                                                   | Broad technology-based discovery and historical data                                                | Use individual lookups; defer subscription                          |
| Wappalyzer               | Free 50 lookups/month; Pro $250/month; API/lead-list access requires a plan                | Technology lookups and indexed discovery                                                            | Free spot checks are enough initially                               |
| Google Places API        | SKU-based pricing with free thresholds                                                     | Official access with usage/storage/attribution conditions                                           | Evaluate rights as well as price; no blanket CRM-export assumption  |

Sources for this table: [Crawlee](https://crawlee.dev/js/docs/introduction), [Crawl4AI](https://github.com/unclecode/crawl4ai), [Apify platform](https://apify.com/pricing), [Compass Actor](https://apify.com/compass/crawler-google-places), [Firecrawl](https://www.firecrawl.dev/pricing), [Serper](https://serper.dev/), [DataForSEO](https://dataforseo.com/Pricing), [Store Leads](https://storeleads.app/), [BuiltWith](https://builtwith.com/plans), [Wappalyzer](https://www.wappalyzer.com/pricing/), [Places billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing?hl=en).

Eligible India Maps accounts have different free thresholds: the official FAQ describes 70,000 monthly events for most Essentials SKUs, 35,000 for Pro, and 7,000 for Enterprise. Eligibility requires India billing and a large majority of usage in India. Do not assume researching foreign prospects automatically qualifies or that every requested field uses the cheapest SKU. [India pricing and eligibility](https://developers.google.com/maps/billing-and-pricing/india)

### Finding and verifying emails

| Option                             | Checked offer                                                                                                           | Important limitation                                                                            | Best role in a pilot                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Published business contact details | No data subscription                                                                                                    | Can be generic, stale, or inappropriate; not automatically verified                             | First discovery stage                                          |
| Hunter                             | Free 50 monthly credits; Starter shown at $34/month with $408 annual billing                                            | Mixed credit units; API-focused offering is separate; no monthly paid quote assumed here        | Domain/contact finder trial                                    |
| Prospeo                            | Free 100 monthly credits; limited API access                                                                            | Bulk/CSV and filters are limited; paid account rate not verified here                           | Test incremental named-contact coverage                        |
| Snov.io                            | Non-expiring free plan called Trial: 50 credits, 100 recipients; Starter $39/month                                      | Finding, verification, recipient and AI quotas differ                                           | Strong paid all-in-one candidate if actually needed            |
| Apollo                             | Free tier exists; paid numeric price not exposed in the checked page                                                    | API endpoints/access and credit consumption differ                                              | Benchmark on your actual buyer niche before buying             |
| Lusha                              | Up to 40 free monthly credits                                                                                           | Credit rules and API/search charges matter; paid numeric quote not established                  | Secondary coverage test rather than first purchase             |
| Reoon                              | Up to 20 daily free checks plus 100 signup credits; 10,000 instant credits $11.90; daily plan from $9/month for 500/day | Free daily credits renew on login; daily allowances do not accumulate; unknown handling matters | Lowest verified small paid verification pack in this shortlist |
| MillionVerifier                    | 100 signup credits on current homepage; service from $39; 50,000-credit selection $89; instant credits do not expire    | Help page and homepage differ on signup credits; confirm before relying on allowance            | Compare when ongoing volume grows                              |
| NeverBounce                        | Official pricing page blocked retrieval                                                                                 | No verified current price in this research                                                      | Quality comparison candidate, not a quoted bargain             |

Sources for this table: [Hunter](https://hunter.io/pricing), [Prospeo free plan](https://help.prospeo.io/en/article/how-to-create-an-account-on-prospeo-for-free-5inxir/), [Snov.io pricing](https://snov.io/pricing), [Snov.io free-plan explanation](https://snov.io/knowledgebase/faq-pricing-plans/?fp_ref=details), [Apollo](https://www.apollo.io/pricing), [Apollo API credits](https://docs.apollo.io/docs/api-pricing), [Lusha](https://www.lusha.com/pricing/), [Reoon](https://www.reoon.com/email-verifier/), [MillionVerifier](https://www.millionverifier.com/), [NeverBounce pricing](https://www.neverbounce.com/pricing).

Do not sign up for every product and call that a free architecture. Pick one initial finder and one verifier, keep provider adapters replaceable, and add another only when measured incremental results justify it. Free-tier UI access does not necessarily imply usable production API access.

### Mail infrastructure and campaign software

| Option                                      | Checked price                                                                                                        | What is separate or uncertain                                                                                                     | Assessment                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Existing legitimate business correspondence | Incremental cost can be $0                                                                                           | Provider terms and purpose of each message still apply                                                                            | Preferred first-revenue route                                                      |
| Google Workspace                            | Checked page shows Starter $7/user/month with annual commitment; regional quote may differ                           | Not a permission grant for unsolicited sending; India amount not reliably exposed                                                 | Ordinary business mailbox option, not a cold-email workaround                      |
| Zoho Mail                                   | Regional pricing page did not expose a reliable numeric amount                                                       | Usage policy excludes the proposed automated marketing use                                                                        | Do not select for this cold-email backend                                          |
| Mailforge                                   | $3/mailbox/month billed monthly; minimum 10 slots; .com $14/year                                                     | Minimum monthly mailbox spend $30 even if only one slot is used; sequencer separate                                               | Verified lawful-B2B infrastructure candidate; minimum is excessive for this volume |
| Maildoso SMTP                               | Official help lists $2.50/mailbox/month at small volume; Custom minimum 10 mailboxes and one domain; $15/domain/year | About $25/month minimum plus domain; terms/acceptance need separate confirmation; other help article has conflicting domain price | Cheaper infrastructure candidate on paper; do not purchase from price alone        |
| Smartlead                                   | Base $39/month, 2,000 contacts and 6,000 sends                                                                       | Mailbox hosting separate; verified-email offering shown with a $59 add-on; confirm API/inbox features needed on Base              | First sequencer to compare when manual operations become costly                    |
| Instantly                                   | Outreach Growth $47/month, 1,000 uploaded contacts and 5,000 sends                                                   | Lead credits are a separate product; higher-tier/bundle figures conflict in page rendering                                        | Reasonable later comparison; do not assume lead data/master inbox is included      |
| Snov.io Starter                             | $39/month                                                                                                            | Quotas and API entitlement need to match use; infrastructure is separate                                                          | May replace both a finder subscription and sequencer if its coverage works         |
| Salesforge                                  | Pro $40/month billed annually in checked page                                                                        | Annual commitment, credit limits, mailbox infrastructure separate; monthly quote not used here                                    | More bundled AI than this pilot needs                                              |
| Lemlist                                     | Email $69 monthly / $55 monthly with annual billing shown                                                            | Data and buying-signal add-ons separate                                                                                           | Compare when multichannel/visual workflow has proved useful                        |
| Reply.io                                    | Email Volume $49 annual display; page elsewhere says starts $59                                                      | Interactive plan combinations make exact monthly quote ambiguous                                                                  | Defer; confirm checkout for any real comparison                                    |
| Clay                                        | Free trial; FAQ says Launch starts $185/month; UI also displays $167 and separate credit figures                     | Actions, data credits, billing modes, and API entitlement differ                                                                  | Powerful convenience/orchestration; unnecessary cash commitment now                |

Sources for this table: [Workspace pricing](https://workspace.google.com/intl/en_in/pricing/), [Zoho pricing](https://www.zoho.com/mail/zohomail-pricing.html), [Mailforge](https://www.mailforge.ai/pricing), [Maildoso official help](https://intercom.help/maildoso/en/articles/16443027-how-much-do-smtp-mailboxes-cost-volume-pricing-tiers), [Smartlead](https://www.smartlead.ai/pricing), [Instantly](https://instantly.ai/pricing), [Snov.io](https://snov.io/pricing), [Salesforge](https://www.salesforge.ai/pricing), [Lemlist](https://www.lemlist.com/pricing), [Reply.io](https://reply.io/pricing/), [Clay](https://www.clay.com/pricing).

“Unlimited connected accounts” usually describes software connections, not free underlying mailboxes. Provider warm-up and deliverability claims are marketing claims unless tested. A cheap verifier plus a cheap finder plus an outreach plan can still be more expensive than one appropriately used bundle; compare actual required entitlements, not feature names.

## 13. Budgets: cash now versus usage economics

Use USD to compare vendor invoices. INR figures below use an explicit **planning assumption of ₹90/USD**, not a verified live exchange rate. Taxes, card FX charges, domain renewals, and existing subscriptions are excluded. Do not treat annual charges as monthly cash outflow.

### A. Recommended: first revenue through warm/expected conversations

40–80 researched businesses/month; referrals, introductions, explicit requests, and appropriate manual channels.

| Item                                                   |                          Additional cash |
| ------------------------------------------------------ | ---------------------------------------: |
| Local website research, notes, JSON import             |                $0 software subscriptions |
| Local model or human drafting                          |                             $0 API spend |
| Finder/verifier free allowances, within genuine limits |                                       $0 |
| Existing account for permitted correspondence          |                                       $0 |
| Optional hosted AI cap                                 |                                 Up to $5 |
| Hosting                                                | $0 if run locally on an existing machine |
| **Total incremental software allowance**               |     **$0–5/month, approximately ₹0–450** |

This excludes buying a new business mailbox/domain if you do not have one. It is not a claim that unsolicited Gmail campaigns can be run for free, or that all 80 businesses will have free verified contacts. Low cash spend means more human research and potentially more skipped contacts.

### B. Small lawful cold-email experiment without a paid sequencer

Illustrative basket using the verified Mailforge terms and its published minimum:

| Item                                         |                            First month |                       Following months |
| -------------------------------------------- | -------------------------------------: | -------------------------------------: |
| Mailforge 10 slots, even if only one is used |                                    $30 |                                    $30 |
| One .com domain                              |                      $14 paid annually |                       $0 until renewal |
| Local research and manual mail client        |                                     $0 |                                     $0 |
| Verification within daily free allowance     |                                     $0 |                                     $0 |
| Optional hosted AI cap                       |                                   $0–5 |                                   $0–5 |
| **Illustrative cash total**                  | **$44–49, approximately ₹3,960–4,410** | **$30–35, approximately ₹2,700–3,150** |

One active mailbox does not require using all ten purchased slots or rotating identities. Confirm the purchase configuration and operational setup before paying. Mailforge is one checked candidate, not the cheapest possible provider worldwide. A lower-minimum provider with suitable terms could improve this basket; I did not establish a fully verified one-mailbox cold-outreach alternative here.

Maildoso's stated small configuration is about $25/month plus $15/year domain, or about $40 first month, before AI/tax, but its acceptance terms remain an unresolved qualification. Keep that candidate separate from the fully checked example. Existing suitable infrastructure can reduce these totals.

### C. More automation after traction

Adding Smartlead Base to basket B would make the first month approximately **$83–88**, then **$69–74/month**, before tax. Optional Apify Starter adds $19/month; an optional Reoon instant pack adds $11.90 once; optional paid finding is additional. Do not add them all by default.

For this team, $39/month is justified only if it saves enough recurring work or prevents enough missed follow-ups to be worth more than $39. At a chosen internal time value of $10/hour, it must save roughly four hours/month before considering setup time. That is illustrative opportunity-cost arithmetic, not a market salary assumption.

### D. Why huge-volume “cheap per lead” claims mislead

For 1,000 businesses, five basic pages each means 5,000 page fetches before retries and screenshots. It does not mean 5,000 qualified leads. Store discovery, extraction, usable contact rate, evidence quality, and review are different denominators.

The illustrative AI workload above is about $3.80 for 1,000 businesses. At Reoon's $11.90/10,000 pack, 1,000 consumed credits allocate about $1.19 of that purchase, but you still pay $11.90 upfront. Firecrawl Hobby's 5,000 basic credits could nominally cover those five pages/business, but additional extraction features, errors, and retries can exhaust that allowance sooner.

If a human reviews 80 leads for five minutes each, that is **6 hours 40 minutes/month**, before sourcing, sending, follow-ups, and sales calls. At 1,000 leads it becomes about 83 hours. Reviewer time will likely become a constraint before text-generation cost.

## 14. Geography and channel rules that affect the design

This is an operational screening summary, not a complete legal opinion. Provider rules and applicable law are separate gates. Verification or public availability alone does not settle either.

| Market                | Relevant distinction                                                                                                                       | Product implication                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| India                 | DPDP implementation is phased; “B2B” and “online” are not blanket exemptions                                                               | Keep source/purpose, contact identity, suppression, and minimal retention; check applicable current provisions for the chosen campaign |
| US                    | CAN-SPAM covers commercial B2B messages too                                                                                                | Accurate identity/subject, clear commercial nature, valid postal address, accessible opt-out; honor within required deadline           |
| UK                    | PECR distinguishes corporate subscribers from sole traders and some partnerships; personal-data rules can still apply                      | Record recipient type and route uncertainty to review                                                                                  |
| France                | Professional outreach can have a different consent treatment from consumer outreach, with relevance and information/objection requirements | Do not apply a consumer or US rule mechanically                                                                                        |
| Germany               | UWG §7 generally requires prior express consent for email advertising, with a narrow existing-customer exception                           | Exclude unsolicited email campaigns unless a suitable exception/permission is established                                              |
| Other Western markets | Rules were not exhaustively researched here                                                                                                | Add a country only after checking its specific rules; no “all Europe” or “all English-speaking markets” switch                         |

The official Indian commencement notification places important processing provisions eighteen months after Gazette publication, with other provisions earlier. As of 5 November 2026, it would be inaccurate to assume all DPDP provisions were already in effect merely because the Rules were announced. Use the Gazette and current amendments rather than a vendor's compliance badge. [MeitY G.S.R. 843(E)](https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf)

For the US, the FTC requires clear commercial identification, a valid postal address, and a functioning opt-out mechanism, with opt-outs honored within ten business days. A reply-based opt-out can be legally usable, but a provider may require a link; Mailforge does. Implement the stricter applicable requirement. [FTC CAN-SPAM guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)

The UK distinction concerns the subscriber, not merely whether the address looks professional. France's regulator describes profession-related B2B conditions, while Germany's statute has a general prior-consent rule for email advertising. These differences are why the first overseas pilot should be a specifically scoped US test, with Europe added deliberately. [ICO business marketing guidance](https://ico.org.uk/for-organisations/advice-for-small-organisations/direct-marketing-and-data-protection/marketing-and-data-protection-in-detail/), [CNIL email prospecting guidance](https://www.cnil.fr/fr/la-prospection-commerciale-par-courrier-electronique), [German UWG §7](https://www.gesetze-im-internet.juris.de/uwg_2004/__7.html)

Do not silently switch an opted-out prospect to Instagram or another email address. Maintain a reasoned suppression scope across Qublox campaigns. Keep only the minimal suppression information needed to avoid contacting someone again, while giving research records a limited retention period.

## 15. A small implementation path, once research is accepted

This is sequencing guidance, not an instruction to build every phase before selling.

### Phase 0: prove the sales workflow manually

Choose the offer and buyer, prepare one relevant proof asset, and work through 10 real businesses. Record source, evidence, contact route, why the offer fits, sent message, reply, next action, and result. Get conversations underway using suitable channels. Do not spend a month on infrastructure before learning whether the offer resonates.

### Phase 1: automate research, keep sending manual

Estimated **3–6 focused engineering days**, assuming a simple local app:

- URL/JSON import and business-level deduplication.
- HTTP-first website extraction with optional browser rendering.
- Evidence records and explicit unknown/error states.
- A small set of platform/contact rules.
- Offer-specific score and draft generation.
- Simple review page or export and a shared suppression/activity log.

Choose a TypeScript worker with Crawlee if that fits the team's existing skills. Use SQLite locally to begin; one process and a persistent jobs table can be enough. If the whole team needs remote access, add authenticated hosting and a shared database rather than exposing a laptop service without access controls. Hosting is a later cost decision, not an inherent first-day dependency.

### Phase 2: reliability and selected paid fallbacks

Estimated **2–5 additional days**: durable job retries, measured extraction quality, provider adapter, budgets, contact verification states, and browser/manual fallback tasks. The Maps hardening estimate is separate if undertaken. Add the dashboard once review friction is visible.

### Phase 3: sending/inbox only after a real bottleneck

Expected **several additional days to weeks**, depending on the providers and whether OAuth review applies. Compare a sequencer subscription against building a queue, reply sync, threading, suppression, reconciliation, and monitoring. This is where buying convenience may become cheaper than maintaining it.

Defer universal social scraping, a large intent database, multi-client inboxes, automated DM sending, dynamic visuals for every contact, and large account fleets. These features do not need to block the first sale.

## 16. Experiments that turn this research into purchase decisions

The thresholds below are proposed decision rules, not industry benchmarks.

### Experiment A: can our crawler provide enough evidence?

Use a manually selected sample of 30 relevant business sites across the intended segment. Include common platforms, custom/JavaScript-heavy sites, and failures. Establish expected fields by human inspection, then compare the local scraper and a hosted free-tier fallback on the same URLs.

Measure factual precision, completeness of required fields, business identity, screenshot usability, blocked-page handling, and review time. A starter goal is at least 80% of sites yielding enough correct context for a human to assess, with no invented high-confidence facts. “80% usable” is not “80% of every field extracted.” Re-run on held-out sites before claiming coverage.

Buy fallback scraping only if it recovers enough otherwise valuable leads to exceed its cash and integration cost. If most missing pages do not change the sales decision, skip them.

### Experiment B: is paid enrichment worth it?

On 40–50 qualified businesses, label public contact availability first. Test one finder and one verifier within allowances. Test a second finder only on unresolved records. Track incremental appropriate contacts, unknown/catch-all outcomes, elapsed time, and cash needed to continue beyond the trial.

Do not send test spam merely to benchmark a verifier. Use provider-supported checks and, where actual outreach is lawful and appropriate, record real bounce outcomes separately. Small samples cannot establish 99% accuracy.

### Experiment C: does personalization improve conversations?

Review 20 drafts blind against their evidence. Check truthfulness, offer relevance, readability, and reviewer edits. A useful starting gate is at least 80% approved with only minor editing and zero unsupported factual claims in approved messages. Tune the rubric before adding more sources.

With only 40–80 prospects, do not claim statistically reliable A/B-test winners. Track qualitative replies, objections, qualified calls, proposals, paid pilots, and collected revenue. Opens alone do not answer whether the system helps sell.

### Experiment D: when do we buy campaign software?

Track weekly minutes spent sending, finding replies, logging actions, and remembering follow-ups. Compare actual time saved to the subscription and switching cost. Buy if recurring time savings or reduced mistakes justify it, not because the product advertises unlimited accounts.

For the four-week sales pilot, aim to complete the 40–80 researched contacts at a sustainable quality level and seek a handful of substantive conversations. A paid pilot is a desired business outcome, not a promised conversion rate. If replies show poor fit, change the offer/segment/proof before increasing sending volume.

## 17. What is settled, and what remains unknown

**Settled enough to act on:** a useful narrow research/review workflow is technically feasible; the existing extension has reusable logic and demonstrable reliability gaps; free allowances can support a small research pilot; paid data and delivery infrastructure are different from waterfall/rotation code; several seemingly cheap sending services prohibit the proposed use.

**Requires a real pilot:** extraction coverage on Qublox's buyer segment, Indian owner-contact coverage versus larger US-company contacts, verifier accuracy on your leads, which offer gets responses, and how much manual time the software saves.

**Unresolved vendor details:** exact paid Apollo/Lusha/Prospeo quotes, some dynamic annual/monthly plan figures, NeverBounce pricing, Maildoso acceptance terms and final configuration price, and a lower-minimum cold-mail provider with fully checked terms. No purchase recommendation depends on treating those unknowns as facts.

**Recommended first decision:** spend the first development effort on evidence capture and review, run one small offer-specific campaign, and keep subscriptions at zero until a measured access or infrastructure requirement justifies one. If cold email becomes an explicit acquisition channel, budget suitable mail infrastructure separately; do not design around free-account rotation or a promise to bypass spam filters.
