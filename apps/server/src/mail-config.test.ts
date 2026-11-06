import { expect, test } from "bun:test";
import { PassThrough } from "node:stream";
import { withSmtpDeadline } from "./gmail";
import { mailboxInput, scheduleTimes, smtpOutcome } from "./mail-config";
test("mailbox input accepts Gmail App Passwords and rejects ordinary passwords or other hosts", () => {
  const ok = mailboxInput.parse({
    email: "Owner@gmail.com",
    displayName: "Mania",
    appPassword: "abcd efgh ijkl mnop",
  });
  expect(ok).toEqual({
    email: "owner@gmail.com",
    displayName: "Mania",
    appPassword: "abcdefghijklmnop",
  });
  const bad = (patch: Record<string, string>) =>
    mailboxInput.safeParse({ ...ok, ...patch }).success;
  expect(bad({ email: "owner@example.com" })).toBe(false);
  expect(bad({ appPassword: "mypassword" })).toBe(false);
  expect(bad({ displayName: "{{sender}}" })).toBe(false);
  expect(bad({ displayName: "Mania\r\nBcc: x" })).toBe(false);
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
