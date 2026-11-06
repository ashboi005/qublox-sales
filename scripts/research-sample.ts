// Measures contact discovery on a list of public websites. Read-only HTTP; respects robots.txt.
// Usage: bun scripts/research-sample.ts sites.json [out.json]
import { researchWebsite } from "../apps/server/src/research";

const [input, output] = Bun.argv.slice(2);
if (!input) throw new Error("Usage: bun scripts/research-sample.ts sites.json [out.json]");
const sites = (await Bun.file(input).json()) as string[];
const rows: { site: string; ok: boolean; emails: string[]; phones: string[]; error?: string }[] =
  [];
const queue = [...sites];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    for (let site = queue.shift(); site; site = queue.shift()) {
      try {
        const r = await researchWebsite(site);
        rows.push({ site, ok: true, emails: r.emails, phones: r.phones });
      } catch (e) {
        rows.push({
          site,
          ok: false,
          emails: [],
          phones: [],
          error: (e as Error).message.slice(0, 90),
        });
      }
    }
  }),
);
rows.sort((a, b) => a.site.localeCompare(b.site));
for (const r of rows)
  console.log(
    `${r.ok ? (r.emails.length ? "EMAIL" : r.phones.length ? "PHONE" : "NONE ") : "FAIL "} ${r.site} ${r.emails.slice(0, 2).join(",")} ${r.phones.slice(0, 1).join(",")} ${r.error || ""}`,
  );
const n = rows.length;
const count = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).length;
console.log(
  `\n${n} sites · readable ${count((r) => r.ok)} · email ${count((r) => r.emails.length > 0)} · phone ${count((r) => r.phones.length > 0)} · email or phone ${count((r) => r.emails.length > 0 || r.phones.length > 0)}`,
);
if (output) await Bun.write(output, JSON.stringify(rows, null, 2));
