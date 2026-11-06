import { expect, test } from "bun:test";
import { secretBox } from "./secret-box";

test("mailbox secrets round-trip, are randomized and fail closed under another key", () => {
  const box = secretBox("a".repeat(40));
  const sealed = box.seal("abcdefghijklmnop");
  expect(sealed).not.toContain("abcdefghijklmnop");
  expect(sealed).not.toBe(box.seal("abcdefghijklmnop"));
  expect(box.open(sealed)).toBe("abcdefghijklmnop");
  expect(() => secretBox("b".repeat(40)).open(sealed)).toThrow();
  const tampered = sealed.slice(0, -2) + (sealed.endsWith("A") ? "BB" : "AA");
  expect(() => box.open(tampered)).toThrow();
  expect(() => secretBox("short")).toThrow("32");
});
