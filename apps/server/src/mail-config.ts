import { z } from "zod";

// What a teammate submits from Settings. Only Gmail addresses with App Passwords.
export const mailboxInput = z.object({
  email: z
    .email()
    .transform((s) => s.trim().toLowerCase())
    .refine((s) => /@(?:gmail|googlemail)\.com$/.test(s), "Use a Gmail address."),
  displayName: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[^\r\n{}\[\]<>"]*$/, "Use a plain name without brackets or quotes."),
  appPassword: z
    .string()
    .transform((s) => s.replace(/\s/g, ""))
    .pipe(
      z
        .string()
        .regex(/^[a-zA-Z0-9]{16}$/, "Paste the 16-character App Password Google generated."),
    ),
});
export type MailboxInput = z.infer<typeof mailboxInput>;
// A decrypted sender, only ever held in memory by the worker or the connection check.
export type Mailbox = { id: string; email: string; appPassword: string; displayName: string };
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
