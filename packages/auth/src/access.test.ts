import { expect, test } from "bun:test";
import { allowedEmails, isTeamMember } from "./access";
test("membership is explicit, normalized, and closed by default", () => {
  expect(isTeamMember("sayam@example.com", allowedEmails(" ASH@example.com, Sayam@Example.com "))).toBe(true);
  expect(isTeamMember("stranger@example.com", allowedEmails("ash@example.com"))).toBe(false);
  expect(isTeamMember("any@example.com", allowedEmails(""))).toBe(false);
});
