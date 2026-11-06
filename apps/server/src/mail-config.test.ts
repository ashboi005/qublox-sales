import { expect, test } from "bun:test";
import { PassThrough } from "node:stream";
import { withSmtpDeadline } from "./gmail";
import { salesConfig } from "./config";
import { mailboxes, scheduleTimes, smtpOutcome } from "./mail-config";
test("Gmail config rejects duplicate identities, ordinary passwords and non-Gmail hosts", () => {
  const c = (input: unknown) => salesConfig({ GMAIL_ACCOUNTS_JSON: JSON.stringify(input) });
  expect(
    mailboxes(c([{ id: "one", email: "Owner@gmail.com", appPassword: "abcd efgh ijkl mnop" }]))[0]!
      .email,
  ).toBe("owner@gmail.com");
  expect(() =>
    mailboxes(c([{ id: "one", email: "owner@example.com", appPassword: "abcdefghijklmnop" }])),
  ).toThrow();
  expect(() =>
    mailboxes(c([{ id: "one", email: "owner@gmail.com", appPassword: "mypassword" }])),
  ).toThrow();
  expect(() =>
    mailboxes(
      c([
        { id: "one", email: "owner@gmail.com", appPassword: "abcdefghijklmnop" },
        { id: "two", email: "OWNER@gmail.com", appPassword: "abcdefghijklmnop" },
      ]),
    ),
  ).toThrow();
});
test("spread scheduling stays ordered inside the chosen window", () => {
  const a = new Date("2026-11-06T10:00:00Z"),
    b = new Date("2026-11-06T14:00:00Z");
  const dates = scheduleTimes(10, a, b, () => 0.5);
  expect(dates).toHaveLength(10);
  expect(dates[0]!.getTime()).toBeGreaterThan(a.getTime());
  expect(dates[9]!.getTime()).toBeLessThan(b.getTime());
  expect(dates.every((d, i) => !i || d > dates[i - 1]!)).toBe(true);
});
test("SMTP rejection is distinguishable from an ambiguous DATA timeout", () => {
  expect(smtpOutcome({ code: "EAUTH" })).toBe("failed");
  expect(smtpOutcome({ command: "RCPT TO", code: "ETIMEDOUT" })).toBe("failed");
  expect(smtpOutcome({ command: "DATA", responseCode: 550 })).toBe("failed");
  expect(smtpOutcome({ command: "DATA", code: "ETIMEDOUT" })).toBe("uncertain");
  expect(smtpOutcome(new Error("unknown"))).toBe("uncertain");
});

test("generic connection errors remain uncertain, including a dropped post-DATA socket", () => {
  expect(smtpOutcome({ command: "CONN", code: "ETIMEDOUT" })).toBe("uncertain");
  expect(smtpOutcome({ command: "CONN", code: "ECONNECTION" })).toBe("uncertain");
});
test("absolute SMTP deadline destroys the owned connection before returning", async () => {
  const stream = new PassThrough();
  await expect(
    withSmtpDeadline(async (own) => {
      own(stream);
      return new Promise<never>(() => {});
    }, 5),
  ).rejects.toThrow("deadline");
  expect(stream.destroyed).toBe(true);
});

test("an already-expired SMTP deadline never invokes the connection operation", async () => {
  let opened = false;
  await expect(
    withSmtpDeadline(async () => {
      opened = true;
      return true;
    }, -1),
  ).rejects.toThrow("before opening");
  expect(opened).toBe(false);
});
