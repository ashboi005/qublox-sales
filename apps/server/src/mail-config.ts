import { z } from "zod";
import type { SalesConfig } from "./config";

const mailboxSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  email: z
    .email()
    .transform((s) => s.trim().toLowerCase())
    .refine((s) => /@(?:gmail|googlemail)\.com$/.test(s)),
  appPassword: z
    .string()
    .transform((s) => s.replace(/\s/g, ""))
    .pipe(z.string().regex(/^[a-zA-Z0-9]{16}$/)),
});
export type Mailbox = z.infer<typeof mailboxSchema>;
export function mailboxes(config: SalesConfig): Mailbox[] {
  let input: unknown;
  try {
    input = JSON.parse(config.GMAIL_ACCOUNTS_JSON);
  } catch {
    throw new Error("Gmail account configuration must be valid JSON.");
  }
  const parsed = z.array(mailboxSchema).max(10).safeParse(input);
  if (!parsed.success)
    throw new Error(
      "Gmail accounts need unique IDs, Gmail addresses and 16-character App Passwords.",
    );
  if (
    new Set(parsed.data.map((m) => m.id)).size !== parsed.data.length ||
    new Set(parsed.data.map((m) => m.email)).size !== parsed.data.length
  )
    throw new Error("Gmail account IDs and addresses must be unique.");
  return parsed.data;
}
export function scheduleTimes(count: number, start: Date, end: Date, random = Math.random) {
  const step = (end.getTime() - start.getTime()) / count;
  return Array.from(
    { length: count },
    (_, i) =>
      new Date(start.getTime() + step * (i + 0.15 + Math.min(0.999, Math.max(0, random())) * 0.7)),
  );
}
export function smtpOutcome(error: unknown): "failed" | "uncertain" {
  const e = error as { code?: string; command?: string; responseCode?: number };
  if (
    e &&
    ((Number(e.responseCode) >= 400 && Number(e.responseCode) < 600) ||
      ["EAUTH", "EENVELOPE", "EDNS", "EDEADLINE"].includes(e.code || "") ||
      /^(AUTH|MAIL FROM|RCPT TO)/.test(e.command || ""))
  )
    return "failed";
  return "uncertain";
}
