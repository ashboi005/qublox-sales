// Qublox Maps collector. Runs in Chrome's isolated content-script world.
(function () {
  "use strict";
  if (globalThis.__qubloxMaps) return;
  globalThis.__qubloxMaps = true;
  const tidy = (value) =>
    (value || "")
      .replace(/[\u200b-\u200d]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const mapLinks = 'a[href*="/maps/place/"], a[href*="?cid="], a[href*="&cid="]';
  const generic = /^(results|google maps|sponsored|advertisement|no results found)$/i;
  const blockedSites =
    /(^|\.)(google\.[a-z.]+|gstatic.com|booking.com|agoda.com|makemytrip.com|expedia.com|hotels.com|tripadvisor.[a-z.]+|trivago.[a-z.]+|goibibo.com)$/i;

  class GoogleMapsScraper {
    constructor() {
      this.scrapedData = [];
      this.scrapedUrls = new Set();
      this.isRunning = false;
      this.busy = false;
      this.message = "Ready. Search Google Maps, then start collecting.";
      this.lastError = "";
      this.DETAIL_TIMEOUT = 10000;
      this.SCROLL_WAIT = 1500;
      this.MAX_SCROLL_FAILS = 4;
      this.ready = this.restore();
    }
    async send(action, extra = {}) {
      const result = await chrome.runtime.sendMessage({ action, ...extra });
      if (result?.error) throw new Error(result.error);
      return result;
    }
    async restore() {
      try {
        const state = await this.send("getPlaces");
        this.scrapedData = state?.records || [];
        this.scrapedUrls = new Set(this.scrapedData.map((r) => this.getUniqueUrl(r.url)));
      } catch {
        this.lastError = "Could not restore saved results. Reload the extension before collecting.";
      }
    }
    wait(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
    progress(message) {
      this.message = message;
    }
    getUniqueUrl(value) {
      try {
        return globalThis.QubloxExtension.placeKey(new URL(value, location.href).toString());
      } catch {
        return "";
      }
    }
    heading() {
      return (
        Array.from(
          document.querySelectorAll('h1.DUwDvf, h1.fontHeadlineLarge, [role="main"] h1, h1'),
        )
          .filter(
            (h) =>
              !h.closest('[role="feed"], [hidden], [aria-hidden="true"]') &&
              !generic.test(tidy(h.textContent)) &&
              !generic.test(h.getAttribute("aria-label") || "") &&
              tidy(h.textContent),
          )
          .sort(
            (a, b) =>
              Number(b.classList.contains("DUwDvf")) - Number(a.classList.contains("DUwDvf")),
          )[0] || null
      );
    }
    detailRoot() {
      const h = this.heading();
      return h?.closest('[role="main"]') || h?.closest(".m6QErb") || h?.parentElement || null;
    }
    extractName() {
      return tidy(this.heading()?.textContent);
    }
    getCards() {
      const feed = document.querySelector('[role="feed"]');
      const detail = this.detailRoot();
      return Array.from((feed || document).querySelectorAll(mapLinks)).filter(
        (a) =>
          globalThis.QubloxExtension.isMapsUrl(a.href) &&
          !a.closest('[hidden], [aria-hidden="true"]') &&
          !(detail && detail.contains(a)) &&
          this.getUniqueUrl(a.href),
      );
    }
    getFeedContainer() {
      const feed = document.querySelector('[role="feed"]');
      if (feed) return feed;
      let node = this.getCards()[0]?.parentElement;
      while (node && node !== document.body) {
        if (node.querySelectorAll(mapLinks).length > 1 && node.scrollHeight > node.clientHeight)
          return node;
        node = node.parentElement;
      }
      return null;
    }
    cleanPhone(value) {
      const phone = tidy(value)
        .replace(/^phone\s*:\s*/i, "")
        .replace(/^tel:/i, "")
        .split("?")[0];
      return /^[+\d() .-]+$/.test(phone) &&
        phone.replace(/\D/g, "").length >= 7 &&
        phone.replace(/\D/g, "").length <= 15
        ? phone
        : "";
    }
    extractPhone(root = this.detailRoot()) {
      const el = root?.querySelector(
        '[data-item-id*="phone"], a[href^="tel:"], button[aria-label^="Phone:"]',
      );
      if (!el) return "";
      return this.cleanPhone(
        el.getAttribute("href") || el.getAttribute("aria-label") || el.textContent,
      );
    }
    extractPhoneFromCard(card) {
      const container =
        card.closest('[data-result-index], [role="article"], .Nv2PK') || card.parentElement;
      if (
        !container ||
        new Set(
          Array.from(container.querySelectorAll(mapLinks)).map((link) =>
            this.getUniqueUrl(link.href),
          ),
        ).size > 1
      )
        return "";
      return this.extractPhone(container);
    }
    extractWebsite(root = this.detailRoot()) {
      const links =
        root?.querySelectorAll(
          '[data-item-id*="authority"], a[data-item-id="website"], a[aria-label^="Website"]',
        ) || [];
      for (const link of links) {
        let raw =
          link.getAttribute("href") ||
          (link.getAttribute("aria-label") || "").replace(/^website:\s*/i, "");
        try {
          let url = new URL(raw.includes("://") ? raw : `https://${raw}`);
          if (/\.google\.[a-z.]+$/.test(url.hostname) && url.pathname === "/url")
            url = new URL(url.searchParams.get("q") || url.searchParams.get("url"));
          if (
            ["http:", "https:"].includes(url.protocol) &&
            !url.username &&
            !url.password &&
            !blockedSites.test(url.hostname) &&
            raw.includes(".")
          )
            return url.toString();
        } catch {
          /* No explicit business website. Never substitute a booking ad. */
        }
      }
      return "";
    }
    extractAddress(root = this.detailRoot()) {
      const el = root?.querySelector('[data-item-id="address"], button[aria-label^="Address:"]');
      return tidy(el?.getAttribute("aria-label") || el?.textContent).replace(/^address:\s*/i, "");
    }
    extractAllData(root = this.detailRoot()) {
      const labels = Array.from(root?.querySelectorAll("[aria-label]") || []).map((el) =>
        el.getAttribute("aria-label"),
      );
      const rating =
        labels.map((s) => s.match(/\b([0-5](?:[.,]\d+)?)\s+stars?\b/i)?.[1]).find(Boolean) || "";
      const reviews =
        labels
          .map((s) => s.match(/\b([\d,\.\s]+)\s+reviews?\b/i)?.[1])
          .find(Boolean)
          ?.replace(/\D/g, "") || "";
      return {
        name: this.extractName(),
        phone: this.extractPhone(root),
        website: this.extractWebsite(root),
        address: this.extractAddress(root),
        rating,
        reviews,
      };
    }
    fingerprint() {
      return JSON.stringify(this.extractAllData());
    }
    detailSnapshot() {
      const root = this.detailRoot();
      const data = this.extractAllData(root);
      const selectors = {
        phone: '[data-item-id*="phone"], a[href^="tel:"], button[aria-label^="Phone:"]',
        website: '[data-item-id*="authority"], a[data-item-id="website"], a[aria-label^="Website"]',
        address: '[data-item-id="address"], button[aria-label^="Address:"]',
      };
      const contacts = Object.entries(selectors).flatMap(([field, selector]) =>
        data[field]
          ? Array.from(root?.querySelectorAll(selector) || []).map((element) => ({
              element,
              field,
              value: data[field],
            }))
          : [],
      );
      return {
        key: this.getUniqueUrl(location.href),
        fingerprint: JSON.stringify(data),
        heading: this.heading(),
        name: data.name,
        contacts,
      };
    }
    async waitForDetailPanel(target, before) {
      const deadline = Date.now() + this.DETAIL_TIMEOUT;
      let signature = "",
        stableAt = 0;
      while (this.isRunning && Date.now() < deadline) {
        const name = this.extractName();
        const current = this.fingerprint();
        const matches =
          name && (!target.name || tidy(name).toLowerCase() === tidy(target.name).toLowerCase());
        const samePlace = this.getUniqueUrl(location.href) === this.getUniqueUrl(target.url);
        const changed =
          before.key === this.getUniqueUrl(target.url) ||
          current !== before.fingerprint ||
          this.heading() !== before.heading;
        const currentRoot = this.detailRoot();
        const currentData = this.extractAllData(currentRoot);
        // Maps can replace the URL/title before replacing the previous hotel's
        // contacts. Never inherit unchanged contact nodes from the old panel.
        const alreadyOpen =
          before.key === this.getUniqueUrl(target.url) &&
          target.name &&
          tidy(before.name).toLowerCase() === tidy(target.name).toLowerCase();
        const freshContacts =
          alreadyOpen ||
          !(before.contacts || []).some(
            (old) => currentRoot?.contains(old.element) && currentData[old.field] === old.value,
          );
        if (matches && samePlace && changed && freshContacts) {
          if (signature !== current) {
            signature = current;
            stableAt = Date.now();
          }
          if (Date.now() - stableAt >= 700) return true;
        } else {
          signature = "";
          stableAt = 0;
        }
        await this.wait(150);
      }
      return false;
    }
    async store(record) {
      const saved = await this.send("savePlace", { record });
      if (saved?.records) this.scrapedData = saved.records;
      else this.scrapedData.push(record);
      this.scrapedUrls.add(this.getUniqueUrl(record.url));
    }
    async scrapeCard(card) {
      const target = {
        url: card.href,
        name: tidy(card.getAttribute("aria-label") || card.textContent),
      };
      if (this.scrapedUrls.has(this.getUniqueUrl(target.url))) return false;
      const before = this.detailSnapshot();
      const phone = this.extractPhoneFromCard(card);
      card.click();
      const loaded = await this.waitForDetailPanel(target, before);
      if (!this.isRunning) return false;
      const data = loaded
        ? this.extractAllData()
        : { name: target.name, phone, website: "", address: "", rating: "", reviews: "" };
      if (!data.name) {
        this.lastError = "A result had no readable business name; it was not saved.";
        return false;
      }
      await this.store({
        ...data,
        phone: data.phone || phone,
        url: target.url,
        scrapedAt: new Date().toISOString(),
        captureStatus: loaded ? "detail" : "list_only",
        warnings: loaded
          ? []
          : ["Detail panel could not be matched. Only list information was saved."],
      });
      return true;
    }
    async scrollFeed() {
      const feed = this.getFeedContainer();
      if (!feed) return;
      // Small increments retain overlapping cards in virtualized result lists.
      feed.scrollTop += Math.max(300, Math.floor((feed.clientHeight || 700) * 0.8));
      await this.wait(this.SCROLL_WAIT);
    }
    hasReachedEnd() {
      return /you.ve reached the end of the list|no more results/i.test(
        this.getFeedContainer()?.textContent || "",
      );
    }
    async start(options = {}) {
      if (this.busy) return;
      this.busy = this.isRunning = true;
      this.lastError = "";
      try {
        await this.ready;
        await this.restore();
        await this.send("claimCollection");
        const limit = Math.max(1, Math.min(100, Number(options.limit) || 50));
        const deadline = Date.now() + 10 * 60 * 1000;
        let stalls = 0;
        if (!this.getCards().length && this.extractName() && this.isRunning) {
          await this.store({
            ...this.extractAllData(),
            url: location.href,
            scrapedAt: new Date().toISOString(),
            captureStatus: "detail",
            warnings: [],
          });
        } else {
          while (this.isRunning && this.scrapedData.length < limit && Date.now() < deadline) {
            const cards = this.getCards();
            if (!cards.length)
              throw new Error(
                "No result cards found. Search Maps or open a business profile first.",
              );
            let added = 0;
            // Identity, not array position: recycled DOM nodes can have the same count.
            const targets = [...new Set(cards.map((card) => this.getUniqueUrl(card.href)))];
            for (const key of targets) {
              if (!this.isRunning || this.scrapedData.length >= limit || Date.now() >= deadline)
                break;
              if (this.scrapedUrls.has(key)) continue;
              const card = this.getCards().find((item) => this.getUniqueUrl(item.href) === key);
              if (!card) continue;
              this.progress(
                `Reading ${tidy(card.getAttribute("aria-label") || card.textContent) || "business"}…`,
              );
              if (await this.scrapeCard(card)) added++;
            }
            if (!this.isRunning || this.hasReachedEnd()) break;
            const before = this.getCards()
              .map((card) => this.getUniqueUrl(card.href))
              .join("|");
            this.progress("Scrolling for more visible results…");
            await this.scrollFeed();
            const after = this.getCards()
              .map((card) => this.getUniqueUrl(card.href))
              .join("|");
            stalls = before === after && !added ? stalls + 1 : 0;
            if (stalls >= this.MAX_SCROLL_FAILS) break;
          }
        }
        this.progress(
          this.isRunning
            ? `${Date.now() >= deadline ? "Time limit reached." : this.scrapedData.length >= limit ? "Collection limit reached." : "Visible scan finished."} ${this.scrapedData.length} places saved.`
            : "Stopped. Collected places are saved.",
        );
      } catch (error) {
        this.lastError = error.message;
        this.progress("Collection stopped. Existing results are retained.");
      } finally {
        this.isRunning = this.busy = false;
        try {
          await this.send("releaseCollection");
        } catch {}
      }
    }
    stop() {
      this.isRunning = false;
      this.progress("Stopping after the current check…");
    }
    async reset() {
      if (this.busy) throw new Error("Stop collection before clearing results.");
      await this.send("resetPlaces");
      this.scrapedData = [];
      this.scrapedUrls.clear();
      this.progress("Collection cleared.");
    }
  }
  const scraper = new GoogleMapsScraper();
  chrome.runtime.onMessage.addListener((request, sender, respond) => {
    if (sender.id && sender.id !== chrome.runtime.id) return;
    (async () => {
      await scraper.ready;
      switch (request.action) {
        case "startScraping":
          if (!scraper.busy) void scraper.start(request);
          break;
        case "stopScraping":
          scraper.stop();
          break;
        case "resetData":
          await scraper.reset();
          break;
        case "getRecords":
          return { records: scraper.scrapedData };
        case "getStatus":
          break;
        default:
          throw new Error("Unknown collector command.");
      }
      return {
        isRunning: scraper.busy,
        count: scraper.scrapedData.length,
        message: scraper.message,
        error: scraper.lastError,
      };
    })().then(respond, (error) => respond({ error: error.message }));
    return true;
  });
})();
