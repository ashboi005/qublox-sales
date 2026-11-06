import { expect, test } from "bun:test";
import { auditEvidence, opportunityFor, pageSignals, pageSpeed } from "./audit";
import { mapReoonStatus } from "./email-verify";
import { researchWebsite } from "./research";
import type { Resource } from "./safe-fetch";

const now = new Date("2026-11-06T10:00:00Z");
const oldSite = `<html><head><title>Sharma Dental</title></head><body>
  <h1>Sharma Dental Clinic in Amritsar</h1>
  <p>Root canals, braces and cleaning for the whole family since 1998.</p>
  <a href="tel:+919812345678">Call us</a>
  <footer>© 2019 Sharma Dental. All rights reserved.</footer></body></html>`;
const modernSite = `<html><head><meta name="viewport" content="width=device-width"></head><body>
  <p>Fresh flowers delivered across Delhi every single day of the week.</p>
  <a href="https://calendly.com/x/visit">Book now</a>
  <a href="/cart">Cart</a><a href="https://wa.me/919812345678">Chat</a>
  <form><input type="email"><textarea></textarea></form>
  <footer>Copyright 2020-2026 Bloom</footer></body></html>`;

test("on-page audit finds missing viewport, old copyright, booking, store, WhatsApp and form", () => {
  expect(pageSignals(oldSite, "http://sharma.example/", now)).toEqual({
    https: false,
    mobileViewport: false,
    copyrightYear: 2019,
    booking: false,
    store: false,
    whatsapp: false,
    contactForm: false,
  });
  expect(pageSignals(modernSite, "https://bloom.example/", now)).toEqual({
    https: true,
    mobileViewport: true,
    copyrightYear: 2026,
    booking: true,
    store: true,
    whatsapp: true,
    contactForm: true,
  });
});

test("audit evidence states measured problems in plain sentences", () => {
  const e = auditEvidence(
    {
      https: false,
      mobileViewport: false,
      copyrightYear: 2019,
      performance: 23,
      largestPaintSeconds: 8.4,
    },
    "http://sharma.example/",
    now,
  )!;
  expect(e.kind).toBe("audit");
  expect(e.text).toContain("scores the homepage 23/100");
  expect(e.text).toContain("about 8.4 seconds");
  expect(e.text).toContain("copyright still says 2019");
  expect(
    auditEvidence({ https: true, mobileViewport: true }, "https://x.example/", now),
  ).toBeNull();
});

test("PageSpeed reads mobile score and largest paint, and fails quietly", async () => {
  let called = "";
  const result = await pageSpeed("https://bloom.example/", "k", async (url) => {
    called = url;
    return Response.json({
      lighthouseResult: {
        categories: { performance: { score: 0.37 } },
        audits: { "largest-contentful-paint": { numericValue: 6420 } },
      },
    });
  });
  expect(new URL(called).searchParams.get("strategy")).toBe("mobile");
  expect(result).toEqual({ performance: 37, largestPaintSeconds: 6.4 });
  expect(
    await pageSpeed("https://bloom.example/", "k", async () => new Response("", { status: 429 })),
  ).toBeNull();
  expect(await pageSpeed("https://bloom.example/", "", async () => Response.json({}))).toBeNull();
});

test("opportunity favours no website, slow or dated sites and established businesses", () => {
  const listing = (text: string) => [
    {
      id: "a",
      url: "https://maps.example/1",
      title: "Listing",
      text,
      kind: "listing" as const,
      retrievedAt: now.toISOString(),
    },
  ];
  const noSite = opportunityFor({
    website: "",
    email: null,
    phone: "+91 98123 45678",
    evidence: listing(
      "Google Maps listing for X. Category: Clothing store. Rating 4.4 from 210 reviews.",
    ),
  });
  expect(noSite.score).toBe(55);
  expect(noSite.reasons).toEqual(["No website", "Established (210 Google reviews)"]);
  const dated = opportunityFor({
    website: "http://sharma.example/",
    email: "hello@sharma.example",
    phone: "",
    evidence: listing("Category: Dental clinic."),
    audit: {
      https: false,
      mobileViewport: false,
      copyrightYear: 2019,
      booking: false,
      performance: 31,
    },
  });
  expect(dated.score).toBe(20 + 15 + 10 + 10 + 10 + 5);
  expect(dated.reasons).toContain("No online booking");
  const fine = opportunityFor({
    website: "https://bloom.example/",
    email: null,
    phone: "",
    evidence: [],
    audit: { https: true, mobileViewport: true, performance: 92 },
  });
  expect(fine).toEqual({ score: 0, reasons: ["No email or phone yet"] });
});

test("Reoon statuses map onto valid, invalid, risky and unknown", () => {
  expect(mapReoonStatus("safe")).toBe("valid");
  expect(mapReoonStatus("disabled")).toBe("invalid");
  expect(mapReoonStatus("disposable")).toBe("invalid");
  expect(mapReoonStatus("catch_all")).toBe("catch_all");
  expect(mapReoonStatus("role_account")).toBe("catch_all");
  expect(mapReoonStatus("unknown")).toBe("unknown");
});

const site = (pages: Record<string, Resource | Error>) => async (url: string) => {
  const page = pages[url];
  if (!page) return { url, body: "", status: 404 };
  if (page instanceof Error) throw page;
  return page;
};

test("a blocked or JavaScript-only homepage is read through the fallback reader", async () => {
  const read: string[] = [];
  const research = await researchWebsite(
    "https://shop.example",
    site({ "https://shop.example/": { url: "https://shop.example/", body: "", status: 403 } }),
    {
      reader: async (url) => {
        read.push(url);
        return {
          url,
          via: "jina",
          body: `<html><body><p>Handmade leather bags and wallets, shipped across India.</p>
            <a href="/contact">Contact</a></body></html>`,
        };
      },
      speed: async () => ({ performance: 28, largestPaintSeconds: 9.1 }),
    },
  );
  // Homepage plus one contact page at most through a reader.
  expect(read).toEqual(["https://shop.example/", "https://shop.example/contact"]);
  expect(research.audit).toMatchObject({ readVia: "jina", performance: 28, mobileViewport: false });
  expect(research.warnings.join(" ")).toContain("Jina Reader");
  expect(research.evidence.map((e) => e.kind)).toContain("audit");
});

test("robots.txt disallow still stops research before any reader is used", async () => {
  let readerUsed = false;
  await expect(
    researchWebsite(
      "https://private.example",
      site({
        "https://private.example/robots.txt": {
          url: "https://private.example/robots.txt",
          body: "User-agent: *\nDisallow: /",
          status: 200,
        },
      }),
      {
        reader: async (url) => {
          readerUsed = true;
          return { url, via: "jina", body: "" };
        },
      },
    ),
  ).rejects.toThrow("does not permit");
  expect(readerUsed).toBe(false);
});

test("a forbidden robots.txt places no rules (RFC 9309) and direct reads skip the reader", async () => {
  let readerUsed = false;
  const research = await researchWebsite(
    "https://ok.example",
    site({
      "https://ok.example/robots.txt": {
        url: "https://ok.example/robots.txt",
        body: "",
        status: 403,
      },
      "https://ok.example/": { url: "https://ok.example/", body: oldSite, status: 200 },
    }),
    {
      reader: async (url) => {
        readerUsed = true;
        return { url, via: "jina", body: "" };
      },
    },
  );
  expect(readerUsed).toBe(false);
  expect(research.audit?.readVia).toBe("direct");
  expect(research.phones).toEqual(["+919812345678"]);
});
