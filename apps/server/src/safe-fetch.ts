import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";

type Address = { address: string; family: number };
type Resolver = (hostname: string) => Promise<Address[]>;
export function isPublicAddress(address: string) {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}

export async function resolvePublicTarget(
  input: string,
  resolver: Resolver = (host) => lookup(host, { all: true }),
) {
  const url = new URL(input);
  const host = url.hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port)) ||
    /(^|\.)(localhost|local|internal|home|lan|test|invalid)$/.test(host)
  )
    throw new Error("Only public business websites can be researched.");
  if (!isIP(host) && !host.includes("."))
    throw new Error("Only public business websites can be researched.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await Promise.race([
        resolver(host),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Website DNS timed out.")), 3000);
        }),
      ]).finally(() => clearTimeout(timer));
  if (!addresses.length || addresses.some((item) => !isPublicAddress(item.address)))
    throw new Error("The website resolves to a non-public network address.");
  const chosen = addresses.find((item) => item.family === 4) || addresses[0]!;
  return { url, host, ...chosen };
}

export type Resource = { url: string; body: string; status: number };
export async function fetchPublicResource(
  input: string,
  types = ["text/html", "application/xhtml+xml"],
  hops = 0,
): Promise<Resource> {
  if (hops > 3) throw new Error("The website redirected too many times.");
  const target = await resolvePublicTarget(input);
  // Connect to the vetted literal address: no second DNS lookup or rebinding window.
  // Host and TLS servername preserve the original website's identity.
  const response = await new Promise<{ status: number; body: string; location?: string }>(
    (resolve, reject) => {
      const transport = target.url.protocol === "https:" ? httpsRequest : httpRequest;
      const req = transport(
        {
          protocol: target.url.protocol,
          hostname: target.address,
          port: target.url.port || undefined,
          servername: isIP(target.host) ? undefined : target.host,
          path: target.url.pathname + target.url.search,
          agent: false,
          headers: {
            Host: target.url.host,
            "User-Agent": "QubloxResearch/0.1 (public business website research)",
            Accept: types.join(", "),
            "Accept-Encoding": "identity",
          },
        },
        (res) => {
          const status = res.statusCode || 500;
          if (status >= 300 && status < 400 && res.headers.location) {
            res.resume();
            resolve({ status, location: res.headers.location, body: "" });
            return;
          }
          if (status < 200 || status >= 300) {
            res.resume();
            resolve({ status, body: "" });
            return;
          }
          const contentType = String(res.headers["content-type"] || "").toLowerCase();
          if (!types.some((type) => contentType.startsWith(type))) {
            res.destroy();
            reject(new Error("The website did not return a supported text page."));
            return;
          }
          if (res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity") {
            res.destroy();
            reject(new Error("The website requires an unsupported response encoding."));
            return;
          }
          let size = 0;
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > 512_000) {
              res.destroy();
              reject(new Error("This page exceeds the research size limit."));
            } else chunks.push(chunk);
          });
          res.on("end", () => resolve({ status, body: Buffer.concat(chunks).toString("utf8") }));
          res.on("error", reject);
        },
      );
      const timeout = setTimeout(
        () => req.destroy(new Error("The website took too long to respond.")),
        10_000,
      );
      req.on("close", () => clearTimeout(timeout));
      req.on("error", reject);
      req.end();
    },
  );
  if (response.location)
    return fetchPublicResource(new URL(response.location, target.url).toString(), types, hops + 1);
  return { url: target.url.toString(), body: response.body, status: response.status };
}
