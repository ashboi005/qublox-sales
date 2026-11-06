import { aiConfigured, LlmDeferred, providerFor } from "./llm-provider";
import { and, asc, eq, lt, lte, or, sql } from "drizzle-orm";
import type { Database } from "@qublox-sales/db";
import { campaigns, jobs, prospects } from "@qublox-sales/db/schema/sales";
import { researchSchema, type DraftInput, type Research } from "@qublox-sales/shared";
import type { SalesConfig } from "./config";
import { generateDraft } from "./llm";
import { logActivity, lockProspect, type ProspectRow } from "./sales";
import { researchWebsite } from "./research";
import { opportunityFor, pageSpeed } from "./audit";
import { apiLedger, pageReader } from "./readers";
import { fetchPublicResource } from "./safe-fetch";

export type ClaimedJob = typeof jobs.$inferSelect;
export async function claimJob(db: Database) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(713219)`);
    // Best opportunities first, then oldest.
    const [found] = await tx
      .select({ job: jobs })
      .from(jobs)
      .innerJoin(prospects, eq(prospects.id, jobs.prospectId))
      .where(
        or(
          and(eq(jobs.status, "queued"), lte(jobs.availableAt, new Date())),
          and(eq(jobs.status, "running"), lt(jobs.lockedAt, new Date(Date.now() - 300_000))),
        ),
      )
      .orderBy(sql`${prospects.opportunity} desc nulls last`, asc(jobs.availableAt))
      .limit(1)
      .for("update", { of: jobs, skipLocked: true });
    const job = found?.job;
    if (!job) return null;
    const p = await lockProspect(tx, job.prospectId);
    if (
      p.version !== job.inputVersion ||
      ["suppressed", "contacted", "replied", "meeting", "closed"].includes(p.status)
    ) {
      await tx.update(jobs).set({ status: "cancelled" }).where(eq(jobs.id, job.id));
      return null;
    }
    const [claimed] = await tx
      .update(jobs)
      .set({
        status: "running",
        attempts: job.attempts + 1,
        lockedAt: new Date(),
        leaseId: crypto.randomUUID(),
      })
      .where(eq(jobs.id, job.id))
      .returning();
    await tx
      .update(prospects)
      .set(job.kind === "research" ? { researchStatus: "running" } : { draftStatus: "running" })
      .where(eq(prospects.id, p.id));
    return claimed!;
  });
}

type Dependencies = {
  research: (url: string) => Promise<Research>;
  draft: (
    p: ProspectRow,
    campaign: typeof campaigns.$inferSelect,
    job: ClaimedJob,
  ) => Promise<DraftInput & { model?: string }>;
};

export async function processJob(
  db: Database,
  config: SalesConfig,
  job: ClaimedJob,
  dependencies?: Partial<Dependencies>,
) {
  try {
    if (job.attempts > 3)
      throw new Error(
        "This research job exceeded its retry limit. Queue a new attempt when ready.",
      );
    const [p] = await db.select().from(prospects).where(eq(prospects.id, job.prospectId));
    if (!p || p.version !== job.inputVersion)
      throw new Error("The prospect changed before the job started.");
    let research: Research | undefined,
      draft: (DraftInput & { model?: string }) | undefined,
      campaignVersion: number | undefined;
    if (job.kind === "research" && !p.website)
      throw new Error("This business has no website to research. Add evidence manually.");
    if (job.kind === "research")
      research = researchSchema.parse(
        await (dependencies?.research || defaultResearch(db, config))(p.website),
      );
    else {
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, p.campaignId || ""));
      if (!campaign) throw new Error("Choose a campaign before drafting.");
      campaignVersion = campaign.version;
      draft = dependencies?.draft
        ? await dependencies.draft(p, campaign, job)
        : await generateDraft(db, config, job.id, p, campaign);
    }
    const applied = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(713219)`);
      const current = await lockProspect(tx, p.id);
      const [lease] = await tx
        .select()
        .from(jobs)
        .where(and(eq(jobs.id, job.id), eq(jobs.leaseId, job.leaseId!), eq(jobs.status, "running")))
        .for("update");
      if (!lease) return false;
      const [campaign] = current.campaignId
        ? await tx.select().from(campaigns).where(eq(campaigns.id, current.campaignId))
        : [];
      if (
        current.version !== job.inputVersion ||
        (draft && campaign?.version !== campaignVersion)
      ) {
        await tx.update(jobs).set({ status: "cancelled" }).where(eq(jobs.id, job.id));
        await tx
          .update(prospects)
          .set(job.kind === "research" ? { researchStatus: "idle" } : { draftStatus: "idle" })
          .where(eq(prospects.id, p.id));
        return false;
      }
      const values: Partial<typeof prospects.$inferInsert> = {
        version: current.version + 1,
        updatedAt: new Date(),
        approvalVersion: null,
        lastError: "",
      };
      if (research) {
        const email = current.email || research.emails[0] || null;
        const phone = current.phone || research.phones[0] || "";
        const evidence = [
          ...current.evidence.filter((item) => ["manual", "listing"].includes(item.kind)),
          ...research.evidence,
        ].slice(0, 30);
        const opportunity = opportunityFor({
          website: current.website,
          email,
          phone,
          evidence,
          audit: research.audit,
        });
        values.opportunity = opportunity.score;
        values.opportunityReasons = opportunity.reasons;
        values.evidence = evidence;
      }
      if (research)
        Object.assign(values, {
          research,
          researchStatus: "complete",
          status: "researched",
          score: null,
          rationale: "",
          draftBody: "",
          draftSubject: "",
          draftEvidenceIds: [],
          draftCampaignVersion: null,
          draftStatus: "idle",
          email: current.email || research.emails[0] || null,
          phone: current.phone || research.phones[0] || "",
          instagram:
            current.instagram ||
            research.socials.find((url) => /(^|\.)instagram\.com$/.test(new URL(url).hostname)) ||
            "",
        });
      if (draft)
        Object.assign(values, {
          score: draft.score,
          rationale: draft.rationale,
          draftSubject: draft.subject,
          draftBody: draft.body,
          draftEvidenceIds: draft.evidenceIds,
          draftCampaignVersion: campaignVersion,
          draftModel: draft.model || `${config.LLM_PROVIDER} / ${providerFor(config).model}`,
          draftStatus: "complete",
          status: draft.score ? "review" : "skipped",
        });
      // Research flows straight into drafting when an offer and AI key are set.
      const chain = Boolean(research && config.AUTO_PIPELINE && campaign && aiConfigured(config));
      if (chain) values.draftStatus = "queued";
      await tx.update(prospects).set(values).where(eq(prospects.id, p.id));
      await tx.update(jobs).set({ status: "done", error: "" }).where(eq(jobs.id, job.id));
      if (chain) {
        await tx.insert(jobs).values({
          id: crypto.randomUUID(),
          prospectId: p.id,
          kind: "draft",
          inputVersion: current.version + 1,
        });
        await logActivity(
          tx,
          p.id,
          "draft_queued",
          "Draft queued automatically after research.",
          "Research assistant",
        );
      }
      await logActivity(
        tx,
        p.id,
        `${job.kind}_complete`,
        research
          ? "Public website evidence collected; contact details remain unverified."
          : draft?.score
            ? "AI draft ready for human review."
            : "No useful signal found; no message suggested.",
        "Research assistant",
      );
      return true;
    });
    console.log(
      JSON.stringify({
        event: applied ? "job_completed" : "job_ignored",
        jobId: job.id,
        kind: job.kind,
      }),
    );
  } catch (error) {
    const deferred = error instanceof LlmDeferred ? error : null;
    const retry = deferred
      ? !deferred.rejected || job.attempts < 3
      : job.kind === "research" && job.attempts < 3;
    const detail =
      error instanceof Error &&
      /^(Only public|The website|This website|This business|This research|No usable|AI |Choose a campaign|The monthly)/.test(
        error.message,
      )
        ? error.message.slice(0, 300)
        : "Research could not complete. Retry later or add evidence manually.";
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(713219)`);
      const p = await lockProspect(tx, job.prospectId);
      const [lease] = await tx
        .select()
        .from(jobs)
        .where(and(eq(jobs.id, job.id), eq(jobs.leaseId, job.leaseId!), eq(jobs.status, "running")))
        .for("update");
      if (!lease) return;
      await tx
        .update(jobs)
        .set({
          status: retry ? "queued" : "failed",
          availableAt: deferred?.retryAt || new Date(Date.now() + job.attempts * 15_000),
          ...(deferred && !deferred.rejected ? { attempts: Math.max(0, job.attempts - 1) } : {}),
          error: detail,
        })
        .where(eq(jobs.id, job.id));
      if (p.version === job.inputVersion)
        await tx
          .update(prospects)
          .set({
            lastError: detail,
            ...(job.kind === "research"
              ? { researchStatus: retry ? "queued" : "failed" }
              : { draftStatus: retry ? "queued" : "failed" }),
          })
          .where(eq(prospects.id, p.id));
    });
    console.error(JSON.stringify({ event: "job_failed", jobId: job.id, kind: job.kind, retry }));
  }
}

// Real research: our own fetch, then Jina/Firecrawl if needed, plus a PageSpeed audit.
function defaultResearch(db: Database, config: SalesConfig) {
  const ledger = apiLedger(db);
  return (url: string) =>
    researchWebsite(url, fetchPublicResource, {
      reader: pageReader(db, config),
      speed: config.PAGESPEED_API_KEY
        ? async (target) => {
            const result = await pageSpeed(target, config.PAGESPEED_API_KEY);
            await ledger.record("pagespeed", Boolean(result));
            return result;
          }
        : undefined,
    });
}
