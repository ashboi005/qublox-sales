import { load } from "cheerio";
import { z } from "zod";
import type { Evidence, Research } from "@qublox-sales/shared";
import { fetchPublicResource, type Resource } from "./safe-fetch";

const unique = (items: string[]) => [...new Set(items)].slice(0, 20);
const text = (value: string) => value.replace(/\s+/g, " ").trim();

export function extractPage(html: string, url: string, retrievedAt = new Date().toISOString()) {
  const $ = load(html);
  const platform = /cdn\.shopify\.com/i.test(html) && /Shopify/i.test(html) ? "Shopify"
    : /woocommerce/i.test(html) && /wp-content|wc-/i.test(html) ? "WooCommerce"
    : /wp-content|wp-includes/i.test(html) ? "WordPress" : /wixstatic\.com/i.test(html) ? "Wix" : /squarespace\.com/i.test(html) ? "Squarespace" : "Unknown";
  const title = text($("title").first().text()).slice(0, 200) || new URL(url).hostname;
  const description = text($("meta[name='description']").attr("content") || "");
  $("script, style, noscript, svg, [hidden], [aria-hidden='true']").remove();
  const emails: string[] = [], phones: string[] = [], socials: string[] = [], links: string[] = [];
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href")?.trim() || "";
    if (/^mailto:/i.test(href)) { try { emails.push(decodeURIComponent(href.slice(7).split("?")[0] || "").trim().toLowerCase()); } catch { /* malformed link */ } }
    if (/^tel:/i.test(href)) phones.push(href.slice(4).replace(/[^+\d() -]/g, "").slice(0, 100));
    try {
      const target = new URL(href, url);
      if (!["http:", "https:"].includes(target.protocol) || target.username || target.password) return;
      if (/(^|\.)(instagram\.com|linkedin\.com|facebook\.com|youtube\.com)$/.test(target.hostname)) socials.push(target.toString());
      if (target.origin === new URL(url).origin && /contact|about|services|wholesale|collections/i.test(target.pathname) && !/logout|signout|cart|checkout/i.test(target.pathname)) { target.hash = ""; links.push(target.toString()); }
    } catch { /* ignore unsupported links */ }
  });
  const body = text($("body").text());
  emails.push(...(body.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map(value => value.toLowerCase()));
  const paragraphs = $("h1, h2, h3, p, li").map((_, element) => text($(element).text())).get().filter(value => value.length >= 20).slice(0, 60);
  const excerpt = text([description, ...paragraphs].join("\n")).slice(0, 2800) || body.slice(0, 2800);
  const evidence: Evidence[] = [];
  if (excerpt) evidence.push({ id: crypto.randomUUID(), url, title, text: excerpt, kind: "website", retrievedAt });
  if (platform !== "Unknown") evidence.push({ id: crypto.randomUUID(), url, title: "Platform clues", text: `Public page assets contain ${platform} markers. This is a platform indication, not an exact plan or a complete backend inspection.`, kind: "technology", retrievedAt });
  return { title, summary: description || excerpt.slice(0, 500), platform, emails: unique(emails.filter(value => z.email().safeParse(value).success)), phones: unique(phones.filter(Boolean)), socials: unique(socials), links: unique(links), evidence };
}

export function robotsAllows(content: string, path: string) {
  const groups: { agents: string[]; rules: { allow: boolean; value: string }[] }[] = [];
  let group = { agents: [] as string[], rules: [] as { allow: boolean; value: string }[] };
  for (const line of content.split(/\r?\n/)) {
    const match = line.replace(/#.*$/, "").match(/^\s*(user-agent|allow|disallow)\s*:\s*(.*?)\s*$/i);
    if (!match) continue;
    const key = match[1]!.toLowerCase(), value = match[2]!;
    if (key === "user-agent") {
      if (group.rules.length) { groups.push(group); group = { agents: [], rules: [] }; }
      group.agents.push(value.toLowerCase());
    } else if (group.agents.length && value) group.rules.push({ allow: key === "allow", value });
  }
  groups.push(group);
  const specific = groups.filter(item => item.agents.some(agent => agent !== "*" && "qubloxresearch".includes(agent)));
  const rules = (specific.length ? specific : groups.filter(item => item.agents.includes("*"))).flatMap(item => item.rules);
  const matches = rules.filter(rule => {
    const pattern = rule.value.split("*").map(part => part.replace(/[.+?^{}()|[\]\\]/g, "\\$&")).join(".*");
    return new RegExp(`^${pattern}`).test(path);
  }).sort((a, b) => b.value.length - a.value.length || Number(b.allow) - Number(a.allow));
  return matches[0]?.allow ?? true;
}

export async function researchWebsite(website: string, fetcher: (url: string, types?: string[]) => Promise<Resource> = fetchPublicResource): Promise<Research> {
  const home = new URL("/", website).toString();
  const robots = await fetcher(new URL("/robots.txt", home).toString(), ["text/plain", "text/html"]);
  if ([401, 403].includes(robots.status) || (robots.status === 200 && !robotsAllows(robots.body, "/"))) throw new Error("This website does not permit automated research. Add a manual observation instead.");
  const response = await fetcher(home);
  if (response.status !== 200) throw new Error(`The website returned HTTP ${response.status}. Add evidence manually or retry later.`);
  const first = extractPage(response.body, response.url);
  if (!first.evidence.length) throw new Error("No usable page text found. This website may require JavaScript; add evidence manually.");
  const pages = [first], warnings: string[] = [];
  // Only follow the same origin. A cross-origin landing redirect is researched, never crawled onward.
  for (const link of first.links.slice(0, 3)) {
    if (new URL(link).origin !== new URL(home).origin || !robotsAllows(robots.body, new URL(link).pathname)) continue;
    try {
      const page = await fetcher(link);
      if (page.status === 200 && new URL(page.url).origin === new URL(response.url).origin) pages.push(extractPage(page.body, page.url));
      else warnings.push(`A linked page could not be read (HTTP ${page.status}).`);
    } catch { warnings.push("A linked page could not be researched."); }
  }
  return { summary: first.summary.slice(0, 4000), platform: pages.find(page => page.platform !== "Unknown")?.platform || "Unknown", emails: unique(pages.flatMap(page => page.emails)), phones: unique(pages.flatMap(page => page.phones)), socials: unique(pages.flatMap(page => page.socials)), evidence: pages.flatMap(page => page.evidence).slice(0, 20), warnings };
}
