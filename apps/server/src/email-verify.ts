import { z } from "zod";
import { and, eq } from "drizzle-orm";
import type { Database } from "@qublox-sales/db";
import { prospects } from "@qublox-sales/db/schema/sales";
import type { SalesConfig } from "./config";
import { AppError } from "./errors";
import { apiLedger, type Fetcher } from "./readers";
import { logActivity } from "./sales";

// On-demand email verification through Reoon. Only runs when someone clicks Verify
// (or Verify & queue); never during import, research or approval.

export type VerificationStatus = "unknown" | "valid" | "invalid" | "catch_all";
const reoonSchema = z.object({ status: z.string() }).passthrough();

// Reoon "power" mode statuses mapped onto the app's four outcomes.
export function mapReoonStatus(status: string): VerificationStatus {
  const s = status.toLowerCase();
  if (s === "safe" || s === "valid") return "valid";
  if (["invalid", "disabled", "disposable", "spamtrap"].includes(s)) return "invalid";
  if (["catch_all", "role_account", "inbox_full"].includes(s)) return "catch_all";
  return "unknown";
}

// A check stays fresh for 30 days for the same address.
const FRESH_MS = 30 * 86400000;

export function emailVerifier(db: Database, config: SalesConfig, fetcher: Fetcher = fetch) {
  const ledger = apiLedger(db);
  return {
    configured: () => Boolean(config.REOON_API_KEY),
    used: () => ledger.used("reoon"),
    async verify(prospectId: string, actor: string, force = false) {
      if (!config.REOON_API_KEY)
        throw new AppError(
          422,
          "VERIFY_NOT_CONFIGURED",
          "Email verification is not set up. Add REOON_API_KEY on the server.",
        );
      const [p] = await db.select().from(prospects).where(eq(prospects.id, prospectId));
      if (!p) throw new AppError(404, "NOT_FOUND", "Prospect not found.");
      if (!p.email) throw new AppError(422, "NO_EMAIL", "This lead has no email to verify.");
      if (
        !force &&
        p.verificationStatus !== "unverified" &&
        p.verificationStatus !== "unknown" &&
        p.emailCheckedAt &&
        Date.now() - p.emailCheckedAt.getTime() < FRESH_MS
      )
        return { status: p.verificationStatus, cached: true, prospect: p };
      if ((await ledger.used("reoon")) >= config.REOON_MONTHLY_LIMIT)
        throw new AppError(
          429,
          "VERIFY_ALLOWANCE",
          `This month's verification allowance (${config.REOON_MONTHLY_LIMIT}) is used. It resets on the 1st, or raise REOON_MONTHLY_LIMIT.`,
        );
      const url = new URL("https://emailverifier.reoon.com/api/v1/verify");
      url.search = new URLSearchParams({
        email: p.email,
        key: config.REOON_API_KEY,
        mode: "power",
      }).toString();
      let status: VerificationStatus;
      try {
        // Power mode checks the mailbox itself and can take up to a minute.
        const response = await fetcher(url.toString(), { signal: AbortSignal.timeout(90_000) });
        if (!response.ok) {
          await response.body?.cancel().catch(() => {});
          throw new Error(`HTTP ${response.status}`);
        }
        status = mapReoonStatus(reoonSchema.parse(await response.json()).status);
      } catch (error) {
        await ledger.record("reoon", false);
        throw new AppError(
          502,
          "VERIFY_FAILED",
          `The verification service did not answer (${error instanceof Error ? error.message.slice(0, 60) : "error"}). Try again shortly.`,
        );
      }
      await ledger.record("reoon", true);
      const [updated] = await db.transaction(async (tx) => {
        const rows = await tx
          .update(prospects)
          .set({ verificationStatus: status, emailCheckedAt: new Date() })
          // Only if the address has not been edited meanwhile.
          .where(and(eq(prospects.id, p.id), eq(prospects.email, p.email!)))
          .returning();
        if (!rows.length) return rows;
        await logActivity(
          tx,
          p.id,
          "email_verified",
          `Email ${p.email} checked: ${status === "catch_all" ? "risky (accepts any address)" : status}.`,
          actor,
        );
        return rows;
      });
      if (!updated)
        throw new AppError(409, "STALE_PROSPECT", "The email changed while it was being checked.");
      return { status, cached: false, prospect: updated };
    },
  };
}
