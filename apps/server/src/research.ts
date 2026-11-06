import { load } from "cheerio";
import { z } from "zod";
import type { Evidence, Research } from "@qublox-sales/shared";
import { fetchPublicResource, type Resource } from "./safe-fetch";

const unique = (items: string[]) => [...new Set(items)].slice(0, 20);
const text = (value: string) => value.replace(/\s+/g, " ").trim();

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,24}/gi;
const freeMail = /@(gmail|yahoo|hotmail|outlook|rediffmail|icloud|live|aol|zoho|proton)\./;
// Theme placeholders, asset names and tracking addresses are not business contacts.
function realEmail(email: string) {
  return (
    z.email().safeParse(email).success &&
    !/\.(png|jpe?g|gif|webp|svg|avif|css|js)$/.test(email) &&
    !/@(example\.(com|org|net)|domain\.com|email\.com|yourdomain\.com|sentry[\w.-]*|wixpress\.com|[\w.-]*\.sentry\.io)$/.test(
      email,
    ) &&
    !/^(you|your|yourname|name|email|user|username|example|test|john|jane|someone|info|support|contact|hello|admin|mail)@(gmail|yahoo|hotmail|outlook)\.com$/.test(
      email,
    )
  );
}
// Cloudflare "email protection" hex: first byte is the XOR key.
export function decodeCfEmail(hex: string) {
  if (!/^[0-9a-f]{4,}$/i.test(hex) || hex.length % 2) return "";
  const key = parseInt(hex.slice(0, 2), 16);
  let out = "";
  for (let i = 2; i < hex.length; i += 2)
    out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return out;
}
// "name [at] shop [dot] com" and "name(at)shop.com".
function deobfuscate(text: string) {
  return text.replace(/\s*[[(]\s*at\s*[\])]\s*/gi, "@").replace(/\s*[[(]\s*dot\s*[\])]\s*/gi, ".");
}
function cleanPhone(value: string) {
  // tel: links sometimes join two numbers; keep the first plausible one.
  for (const part of value.split(/[\/,;|]| or /i)) {
    const phone = part.replace(/[^+\d() -]/g, "").trim();
    const digits = phone.replace(/\D/g, "").length;
    if (digits >= 7 && digits <= 13) return phone.slice(0, 100);
  }
  return "";
}
function jsonLdContacts(raw: string) {
  const emails: string[] = [],
    phones: string[] = [];
  const visit = (node: unknown, depth: number) => {
    if (!node || typeof node !== "object" || depth > 6) return;
    if (Array.isArray(node)) return node.slice(0, 50).forEach((n) => visit(n, depth + 1));
    for (const [key, value] of Object.entries(node)) {
      if (key === "email" && typeof value === "string")
        emails.push(
          value
            .replace(/^mailto:/i, "")
            .trim()
            .toLowerCase(),
        );
      else if (key === "telephone" && typeof value === "string") phones.push(cleanPhone(value));
      else visit(value, depth + 1);
    }
  };
  try {
    visit(JSON.parse(raw), 0);
  } catch {
    /* malformed structured data */
  }
  return { emails, phones };
}

// Business-domain addresses first, then free-mail addresses; junk removed.
function rankEmails(emails: string[], url: string) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const real = [...new Set(emails.map((e) => e.trim().replace(/\.$/, "")).filter(realEmail))];
  const score = (e: string) =>
    (e.endsWith(`@${host}`) ? 0 : freeMail.test(e) ? 1 : 2) +
    (/^(hr|careers?|jobs?|recruit\w*|privacy|legal|abuse|no-?reply|webmaster)@/.test(e) ? 3 : 0);
  return real.sort((a, b) => score(a) - score(b)).slice(0, 20);
}

export function extractPage(html: string, url: string, retrievedAt = new Date().toISOString()) {
  // A space between tags keeps adjacent text ("info@x.in" + "Phone") from merging.
  const $ = load(html.replace(/>\s*</g, "> <"));
  const structured = $('script[type="application/ld+json"]')
    .map((_, el) => jsonLdContacts($(el).text().slice(0, 100_000)))
    .get();
  const platform =
    /cdn\.shopify\.com/i.test(html) && /Shopify/i.test(html)
      ? "Shopify"
      : /woocommerce/i.test(html) && /wp-content|wc-/i.test(html)
        ? "WooCommerce"
        : /wp-content|wp-includes/i.test(html)
          ? "WordPress"
          : /wixstatic\.com/i.test(html)
            ? "Wix"
            : /squarespace\.com/i.test(html)
              ? "Squarespace"
              : "Unknown";
  const title = text($("title").first().text()).slice(0, 200) || new URL(url).hostname;
  const description = text($("meta[name='description']").attr("content") || "");
  $("script, style, noscript, svg, [hidden], [aria-hidden='true']").remove();
  const emails: string[] = [],
    phones: string[] = [],
    socials: string[] = [],
    links: string[] = [];
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href")?.trim() || "";
    if (/^mailto:/i.test(href)) {
      try {
        emails.push(
          decodeURIComponent(href.slice(7).split("?")[0] || "")
            .trim()
            .toLowerCase(),
        );
      } catch {
        /* malformed link */
      }
    }
    if (/^tel:/i.test(href)) {
      try {
        phones.push(cleanPhone(decodeURIComponent(href.slice(4))));
      } catch {
        /* malformed link */
      }
    }
    const cf = href.match(/\/cdn-cgi\/l\/email-protection#([0-9a-f]+)/i);
    if (cf) emails.push(decodeCfEmail(cf[1]!).toLowerCase());
    const wa = href.match(
      /^https?:\/\/(?:wa\.me\/|(?:api|web)\.whatsapp\.com\/send\/?\?(?:[^#]*&)?phone=)\+?(\d{8,15})/i,
    );
    if (wa) phones.push(`+${wa[1]}`);
    try {
      const target = new URL(href, url);
      if (!["http:", "https:"].includes(target.protocol) || target.username || target.password)
        return;
      if (/(^|\.)(instagram\.com|linkedin\.com|facebook\.com|youtube\.com)$/.test(target.hostname))
        socials.push(target.toString());
      if (
        target.origin === new URL(url).origin &&
        /contact|about|services|wholesale|collections/i.test(target.pathname) &&
        !/logout|signout|cart|checkout/i.test(target.pathname)
      ) {
        target.hash = "";
        links.push(target.toString());
      }
    } catch {
      /* ignore unsupported links */
    }
  });
  $("[data-cfemail]").each((_, el) => {
    emails.push(decodeCfEmail($(el).attr("data-cfemail") || "").toLowerCase());
  });
  for (const found of structured) {
    emails.push(...found.emails);
    phones.push(...found.phones);
  }
  const body = text($("body").text());
  emails.push(...(deobfuscate(body).match(emailPattern) || []).map((value) => value.toLowerCase()));
  const paragraphs = $("h1, h2, h3, p, li")
    .map((_, element) => text($(element).text()))
    .get()
    .filter((value) => value.length >= 20)
    .slice(0, 60);
  const excerpt =
    text([description, ...paragraphs].join("\n")).slice(0, 2800) || body.slice(0, 2800);
  const evidence: Evidence[] = [];
  if (excerpt)
    evidence.push({
      id: crypto.randomUUID(),
      url,
      title,
      text: excerpt,
      kind: "website",
      retrievedAt,
    });
  if (platform !== "Unknown")
    evidence.push({
      id: crypto.randomUUID(),
      url,
      title: "Platform clues",
      text: `Public page assets contain ${platform} markers. This is a platform indication, not an exact plan or a complete backend inspection.`,
      kind: "technology",
      retrievedAt,
    });
  return {
    title,
    summary: description || excerpt.slice(0, 500),
    platform,
    emails: rankEmails(emails, url),
    phones: unique(phones.filter(Boolean)),
    socials: unique(socials),
    links: unique(links),
    evidence,
  };
}

// Match wildcard-separated literal fragments without evaluating untrusted regex.
function robotsPatternMatches(pattern: string, path: string) {
  const endAnchored = pattern.endsWith("$");
  const parts = (endAnchored ? pattern.slice(0, -1) : pattern).split("*");
  const first = parts.shift() || "";
  if (!path.startsWith(first)) return false;
  let cursor = first.length;
  if (!parts.length) return !endAnchored || cursor === path.length;
  const suffix = endAnchored ? parts.pop()! : "";
  const limit = path.length - suffix.length;
  if (limit < cursor || (endAnchored && !path.endsWith(suffix))) return false;
  for (const part of parts) {
    if (!part) continue;
    const position = path.indexOf(part, cursor);
    if (position < 0 || position + part.length > limit) return false;
    cursor = position + part.length;
  }
  return true;
}

export function robotsAllows(content: string, path: string) {
  const lines = content.split(/\r?\n/);
  // Refuse unusually large policies rather than applying an incomplete policy.
  if (lines.length > 2000 || path.length > 4096) return false;
  let ruleCount = 0;
  const groups: { agents: string[]; rules: { allow: boolean; value: string }[] }[] = [];
  let group = { agents: [] as string[], rules: [] as { allow: boolean; value: string }[] };
  for (const line of lines) {
    if (line.length > 4096) return false;
    const match = line
      .replace(/#.*$/, "")
      .match(/^\s*(user-agent|allow|disallow)\s*:\s*(.*?)\s*$/i);
    if (!match) continue;
    const key = match[1]!.toLowerCase(),
      value = match[2]!;
    if (key === "user-agent") {
      if (group.rules.length) {
        groups.push(group);
        group = { agents: [], rules: [] };
      }
      if (value) group.agents.push(value.toLowerCase());
    } else if (group.agents.length && value) {
      if (++ruleCount > 500 || value.length > 2048) return false;
      group.rules.push({ allow: key === "allow", value });
    }
  }
  groups.push(group);
  const specific = groups.filter((item) =>
    item.agents.some((agent) => agent !== "*" && "qubloxresearch".includes(agent)),
  );
  const rules = (
    specific.length ? specific : groups.filter((item) => item.agents.includes("*"))
  ).flatMap((item) => item.rules);
  const specificity = (value: string) => value.replaceAll("*", "").replace(/\$$/, "").length;
  const matches = rules
    .filter((rule) => robotsPatternMatches(rule.value, path))
    .sort(
      (a, b) => specificity(b.value) - specificity(a.value) || Number(b.allow) - Number(a.allow),
    );
  return matches[0]?.allow ?? true;
}

export async function researchWebsite(
  website: string,
  fetcher: (url: string, types?: string[]) => Promise<Resource> = fetchPublicResource,
): Promise<Research> {
  const home = new URL("/", website).toString();
  const robots = await fetcher(new URL("/robots.txt", home).toString(), [
    "text/plain",
    "text/html",
  ]);
  if (
    [401, 403].includes(robots.status) ||
    (robots.status === 200 && !robotsAllows(robots.body, "/"))
  )
    throw new Error(
      "This website does not permit automated research. Add a manual observation instead.",
    );
  const response = await fetcher(home);
  if (response.status !== 200)
    throw new Error(
      `The website returned HTTP ${response.status}. Add evidence manually or retry later.`,
    );
  const first = extractPage(response.body, response.url);
  if (!first.evidence.length)
    throw new Error(
      "No usable page text found. This website may require JavaScript; add evidence manually.",
    );
  const pages = [first],
    warnings: string[] = [];
  // Only follow the same origin. A cross-origin landing redirect is researched, never crawled onward.
  // Contact pages first. Without an email or a contact link, try the usual contact paths.
  const rank = (link: string) =>
    /contact/i.test(new URL(link).pathname) ? 0 : /about/i.test(new URL(link).pathname) ? 1 : 2;
  const linked = [...first.links].sort((a, b) => rank(a) - rank(b));
  const guesses =
    first.emails.length || linked.some((l) => rank(l) === 0)
      ? []
      : ["/contact", "/contact-us", "/pages/contact"].map((path) =>
          new URL(path, response.url).toString(),
        );
  const visited = new Set([new URL(response.url).toString()]);
  const candidates = [...linked.slice(0, 3), ...guesses].filter((link) => {
    const fresh = !visited.has(link);
    visited.add(link);
    return fresh;
  });
  for (const link of candidates) {
    if (pages.length >= 4) break;
    const guessed = guesses.includes(link);
    if (
      new URL(link).origin !== new URL(response.url).origin ||
      !robotsAllows(robots.body, new URL(link).pathname)
    )
      continue;
    try {
      const page = await fetcher(link);
      if (page.status === 200 && new URL(page.url).origin === new URL(response.url).origin) {
        pages.push(extractPage(page.body, page.url));
        if (guessed) break;
      } else if (!guessed) warnings.push(`A linked page could not be read (HTTP ${page.status}).`);
    } catch {
      if (!guessed) warnings.push("A linked page could not be researched.");
    }
  }
  return {
    summary: first.summary.slice(0, 4000),
    platform: pages.find((page) => page.platform !== "Unknown")?.platform || "Unknown",
    emails: rankEmails(
      pages.flatMap((page) => page.emails),
      response.url,
    ),
    phones: unique(pages.flatMap((page) => page.phones)),
    socials: unique(pages.flatMap((page) => page.socials)),
    evidence: pages.flatMap((page) => page.evidence).slice(0, 20),
    warnings,
  };
}
