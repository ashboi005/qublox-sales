import { expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../content.js", import.meta.url), "utf8");
function setup(html, href = "https://www.google.com/maps/search/hotels") {
  const { document } = parseHTML(`<html><body>${html}</body></html>`);
  const context = {
    document,
    location: { href },
    URL,
    console: { log() {} },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    crypto,
    chrome: { runtime: { onMessage: { addListener() {} }, sendMessage: async () => {} } },
  };
  context.window = context;
  runInNewContext(readFileSync(new URL("../core.js", import.meta.url), "utf8"), context);
  runInNewContext(
    source.replace(
      "const scraper = new GoogleMapsScraper();",
      "const scraper = new GoogleMapsScraper(); globalThis.scraper = scraper;",
    ),
    context,
  );
  context.scraper.testContext = context;
  return context.scraper;
}

test("hotel business name wins over the Sponsored heading", () => {
  const scraper = setup(
    readFileSync(new URL("fixtures/hotel-detail.html", import.meta.url), "utf8"),
  );
  expect(scraper.extractAllData().name).toBe("Courtyard by Marriott Amritsar");
});

test("an already-open target keeps its own unchanged contacts", async () => {
  const target = "https://www.google.com/maps?cid=2";
  const scraper = setup(
    '<main role="main"><h1 class="DUwDvf">Hotel Open</h1><a data-item-id="authority" href="https://open-hotel.example/">Website</a><button data-item-id="phone:1" aria-label="Phone: 01234 567890"></button></main>',
    target,
  );
  const before = scraper.detailSnapshot();
  scraper.isRunning = true;
  expect(await scraper.waitForDetailPanel({ url: target, name: "Hotel Open" }, before)).toBe(true);
  expect(scraper.extractAllData().website).toBe("https://open-hotel.example/");
});
test("unmatched partial transitions save only the clicked card, never old contacts", async () => {
  const scraper = setup(
    '<div role="feed"><a href="https://www.google.com/maps?cid=2" aria-label="New Hotel">New Hotel</a></div><main role="main"><h1 class="DUwDvf">Old Hotel</h1><a data-item-id="authority" href="https://old-hotel.example/">Website</a><button data-item-id="phone:1" aria-label="Phone: 01234 567890"></button></main>',
    "https://www.google.com/maps?cid=1",
  );
  const doc = scraper.testContext.document;
  const card = doc.querySelector('[role="feed"] a');
  card.click = () => {
    scraper.testContext.location.href = card.href;
    doc.querySelector("h1").textContent = "New Hotel";
  };
  await scraper.ready;
  scraper.isRunning = true;
  scraper.DETAIL_TIMEOUT = 1000;
  await scraper.scrapeCard(card);
  expect(scraper.scrapedData[0]).toMatchObject({
    name: "New Hotel",
    phone: "",
    website: "",
    captureStatus: "list_only",
  });
});
test("live hotel details retain their actual phone and review count", () => {
  const scraper = setup(readFileSync(new URL("fixtures/hotel-live.html", import.meta.url), "utf8"));
  expect(scraper.extractAllData()).toMatchObject({
    name: "Hotel Grand Fortune",
    phone: "078145 41418",
    rating: "4.1",
    reviews: "218",
    website: "",
  });
});
test("ordinary businesses still extract their explicit website and phone", () => {
  const scraper = setup(
    readFileSync(new URL("fixtures/ordinary-detail.html", import.meta.url), "utf8"),
  );
  expect(scraper.extractAllData()).toMatchObject({
    name: "Sahib Dental Clinic",
    phone: "075892 06060",
    website: "https://sahibdentalclinic.com/",
    rating: "4.4",
    reviews: "105",
  });
});
test("booking links and nightly prices never become a business website or phone", () => {
  const scraper = setup(
    '<div role="main"><h1 class="DUwDvf">Hotel Example</h1><a href="https://booking.com/hotel/example">Visit site</a><button>From ₹12345678 per night</button><span>2026</span></div>',
  );
  expect(scraper.extractAllData()).toMatchObject({ website: "", phone: "", reviews: "" });
});
test("place identity preserves CID and ignores tracking parameters", () => {
  const scraper = setup("");
  expect(scraper.getUniqueUrl("https://www.google.com/maps?cid=123&hl=en")).not.toBe(
    scraper.getUniqueUrl("https://www.google.com/maps?cid=456&hl=en"),
  );
  expect(scraper.getUniqueUrl("https://www.google.com/maps?cid=123&hl=en")).toBe(
    scraper.getUniqueUrl("https://www.google.com/maps?cid=123&hl=hi"),
  );
});
test("detail navigation ignores a search term embedded before the actual place identifier", () => {
  const scraper = setup("");
  expect(
    scraper.getUniqueUrl(
      "https://www.google.com/maps/place/Hotel/data=!4m10!1shotels+in+Amritsar!3m6!1s0x391963f2f21f8a99:0x815ccf3fddbed7a9!8m2!3d31.6",
    ),
  ).toBe(
    scraper.getUniqueUrl(
      "https://www.google.com/maps/place/Hotel/data=!4m10!3m9!1s0x391963f2f21f8a99:0x815ccf3fddbed7a9!5m2!4m1!1i2",
    ),
  );
});
test("hotel list markup is discoverable without a feed-role dependency", () => {
  const html = readFileSync(
    new URL("fixtures/hotel-results.html", import.meta.url),
    "utf8",
  ).replaceAll('role="feed"', 'role="region"');
  expect(setup(html).getCards().length).toBeGreaterThanOrEqual(6);
});
test("same-name branches load based on their place identity and changed details", async () => {
  const target = "https://www.google.com/maps/place/Hotel/data=!1s0x1:0x2";
  const scraper = setup(
    '<main role="main"><h1 class="DUwDvf">Same Hotel</h1><button data-item-id="address" aria-label="Address: New branch"></button></main>',
    target,
  );
  scraper.isRunning = true;
  expect(
    await scraper.waitForDetailPanel(
      { url: target, name: "Same Hotel" },
      { key: "place:0x1:0x1", fingerprint: "Old branch", heading: null },
    ),
  ).toBe(true);
});
test("a stale panel with another business is not accepted as the clicked result", async () => {
  const target = "https://www.google.com/maps/place/Hotel/data=!1s0x1:0x2";
  const scraper = setup('<main role="main"><h1 class="DUwDvf">Old Hotel</h1></main>', target);
  scraper.isRunning = true;
  scraper.DETAIL_TIMEOUT = 10;
  expect(
    await scraper.waitForDetailPanel(
      { url: target, name: "New Hotel" },
      { key: "place:0x1:0x1", fingerprint: "", heading: null },
    ),
  ).toBe(false);
});
test("virtualized replacement cards are visited even when their count stays unchanged", async () => {
  const scraper = setup("");
  let round = 0;
  const cards = [0, 1].map((group) =>
    [0, 1].map((index) => ({
      href: `https://www.google.com/maps/place/P${group * 2 + index}/data=!1s0x1:0x${group * 2 + index}`,
      getAttribute: () => `Place ${group * 2 + index}`,
    })),
  );
  scraper.getFeedContainer = () => ({});
  scraper.getCards = () => cards[Math.min(round, 1)];
  scraper.scrapeCard = async (card) => {
    scraper.scrapedUrls.add(scraper.getUniqueUrl(card.href));
    scraper.scrapedData.push({ name: card.getAttribute(), url: card.href });
    return true;
  };
  scraper.hasReachedEnd = () => round >= 1;
  scraper.scrollFeed = async () => {
    round++;
  };
  scraper.wait = async () => {};
  await scraper.start();
  expect(scraper.scrapedData).toHaveLength(4);
});

for (const name of ["New Hotel", "Same Hotel"])
  test(`partial transitions retain no contacts from the previous place (${name})`, async () => {
    const scraper = setup(
      '<main role="main"><h1 class="DUwDvf">Same Hotel</h1><a data-item-id="authority" href="https://old-hotel.example/">Website</a><button data-item-id="phone:1" aria-label="Phone: 01234 567890"></button><button data-item-id="address" aria-label="Address: Old branch"></button></main>',
      "https://www.google.com/maps?cid=1",
    );
    const doc = scraper.testContext.document;
    const before = scraper.detailSnapshot();
    scraper.testContext.location.href = "https://www.google.com/maps?cid=2";
    doc.querySelector("h1").textContent = name;
    doc.querySelector('[data-item-id="address"]').setAttribute("aria-label", "Address: New branch");
    scraper.isRunning = true;
    scraper.DETAIL_TIMEOUT = 1000;
    expect(
      await scraper.waitForDetailPanel({ url: "https://www.google.com/maps?cid=2", name }, before),
    ).toBe(false);
  });
