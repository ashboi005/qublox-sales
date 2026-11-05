import { describe, expect, test } from "bun:test";
import { resolvePublicTarget, isPublicAddress } from "./safe-fetch";
import { extractPage, robotsAllows } from "./research";

describe("public network boundary", () => {
  test("rejects private, loopback, reserved and mapped private addresses", () => {
    for (const ip of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "100.64.0.1", "192.0.2.1", "::1", "fd00::1", "::ffff:127.0.0.1"]) expect(isPublicAddress(ip)).toBe(false);
    expect(isPublicAddress("1.1.1.1")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });
  test("rejects alternate loopback encodings and credentials", async () => {
    for (const url of ["http://2130706433", "http://0x7f000001", "http://[::1]", "http://localhost", "https://u:p@example.com", "https://example.com:8443"]) await expect(resolvePublicTarget(url)).rejects.toThrow();
  });
  test("rejects a hostname with mixed public/private DNS answers", async () => {
    await expect(resolvePublicTarget("https://example.com", async () => [{ address: "1.1.1.1", family: 4 }, { address: "10.0.0.1", family: 4 }])).rejects.toThrow();
  });
});

test("extracts contacts, platforms and source evidence without executing scripts", () => {
  const page = extractPage(`<html><title>Small Store</title><meta name="description" content="Handmade linen goods"><script src="https://cdn.shopify.com/theme.js"></script><script>window.Shopify={}; const hidden='secret@example.com'</script><body><h1>Linen made in India</h1><p>Email us for wholesale orders and catalogue requests.</p><a href="mailto:HELLO@store.example">Email</a><a href="tel:+919876543210">Call</a><a href="https://instagram.com/smallstore">Instagram</a><a href="/contact">Contact</a><a href="javascript:alert(1)">Invalid</a></body></html>`, "https://store.example/", "2026-11-05T10:00:00.000Z");
  expect(page.emails).toEqual(["hello@store.example"]);
  expect(page.phones).toEqual(["+919876543210"]);
  expect(page.platform).toBe("Shopify");
  expect(page.links).toContain("https://store.example/contact");
  expect(page.evidence.every(item => item.url === "https://store.example/")).toBe(true);
  expect(page.evidence.map(item => item.text).join(" ")).not.toContain("secret@example.com");
});

test("honors the most specific matching robots rule", () => {
  const rules = "User-agent: *\nDisallow: /private\nAllow: /private/public\n";
  expect(robotsAllows(rules, "/contact")).toBe(true);
  expect(robotsAllows(rules, "/private/account")).toBe(false);
  expect(robotsAllows(rules, "/private/public/info")).toBe(true);
  expect(robotsAllows("User-agent: *\nDisallow: /", "/")).toBe(false);
});
