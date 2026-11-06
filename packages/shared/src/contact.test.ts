import { expect, test } from "bun:test";
import { phoneKey, whatsappLink, whatsappNumber } from "./contact";

test("WhatsApp numbers default to India for local formats and keep explicit country codes", () => {
  expect(whatsappNumber("098765 43210", "")).toBe("919876543210");
  expect(whatsappNumber("98765-43210", "India")).toBe("919876543210");
  expect(whatsappNumber("+91 98765 43210", "")).toBe("919876543210");
  expect(whatsappNumber("+1 (415) 555-0100", "United States")).toBe("14155550100");
  expect(whatsappNumber("415 555 0100", "United States")).toBe("14155550100");
  expect(whatsappNumber("0161 496 0000", "United Kingdom")).toBe(null);
  expect(whatsappNumber("12345", "")).toBe(null);
});

test("wa.me links carry the message text and phone keys deduplicate formats", () => {
  expect(whatsappLink("+91 98765 43210", "", "Hi team,\nAsha here")).toBe(
    "https://wa.me/919876543210?text=Hi%20team%2C%0AAsha%20here",
  );
  expect(whatsappLink("123", "", "x")).toBe(null);
  expect(phoneKey("+91 98765 43210")).toBe(phoneKey("098765-43210"));
  expect(phoneKey("")).toBe("");
});
