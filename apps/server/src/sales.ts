import { emailOutbox } from "@qublox-sales/db/schema/delivery";
import { createMailboxService, type Viewer } from "./mailboxes";
import { contactCapacity } from "./contact-cap";
import { providerFor } from "./llm-provider";
import { and, count, desc, eq, gte, ilike, inArray, lte, or, sql, sum } from "drizzle-orm";
import type { Database } from "@qublox-sales/db";
import {
  activities,
  campaigns,
  jobs,
  llmUsage,
  prospects,
  suppressions,
} from "@qublox-sales/db/schema/sales";
import {
  normalizeWebsite,
  prospectInput,
  unsupportedPlaceholders,
  validateDraftEvidence,
  type CampaignInput,
  type DraftInput,
  type Evidence,
  type ProspectInput,
  type ProspectStatus,
} from "@qublox-sales/shared";
import type { SalesConfig } from "./config";
import { AppError, conflict } from "./errors";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type ProspectRow = typeof prospects.$inferSelect;
type Writer = Database | Tx;
const immutable = new Set<ProspectStatus>([
  "contacted",
  "replied",
  "meeting",
  "closed",
  "suppressed",
]);
export const newId = () => crypto.randomUUID();

export async function logActivity(
  db: Writer,
  id: string,
  kind: string,
  detail: string,
  actor: string,
) {
  await db.insert(activities).values({ id: newId(), prospectId: id, kind, detail, actor });
}
export async function lockProspect(tx: Tx, id: string, version?: number, allowUncertain = false) {
  await tx.execute(sql`select pg_advisory_xact_lock(713219)`);
  const [p] = await tx.select().from(prospects).where(eq(prospects.id, id)).for("update");
  if (!p) throw new AppError(404, "NOT_FOUND", "Prospect not found.");
  if (version !== undefined && p.version !== version) conflict();
  const [delivery] = await tx
    .select({ status: emailOutbox.status })
    .from(emailOutbox)
    .where(
      and(
        eq(emailOutbox.prospectId, id),
        inArray(emailOutbox.status, allowUncertain ? ["sending"] : ["sending", "uncertain"]),
      ),
    );
  if (delivery)
    conflict(
      delivery.status === "sending"
        ? "An email is being dispatched. Wait for its result before editing."
        : "Check Gmail and resolve the uncertain email before editing or sending again.",
    );
  return p;
}
export async function assertNotSuppressed(
  db: Writer,
  p: Pick<ProspectRow, "domain" | "email" | "status">,
) {
  const [match] = await db
    .select({ id: suppressions.id })
    .from(suppressions)
    .where(
      or(eq(suppressions.domain, p.domain), p.email ? eq(suppressions.email, p.email) : undefined),
    )
    .limit(1);
  if (match || p.status === "suppressed") conflict("This business is on the do-not-contact list.");
}
function assertEditable(p: ProspectRow) {
  if (immutable.has(p.status))
    conflict("This prospect is already contacted or closed. Use the activity actions instead.");
}
async function save(tx: Tx, p: ProspectRow, values: Partial<typeof prospects.$inferInsert>) {
  await tx
    .update(emailOutbox)
    .set({
      status: "cancelled",
      lastError: "Prospect changed; queue the newly approved version if needed.",
    })
    .where(and(eq(emailOutbox.prospectId, p.id), eq(emailOutbox.status, "queued")));
  await tx
    .update(jobs)
    .set({ status: "cancelled" })
    .where(and(eq(jobs.prospectId, p.id), inArray(jobs.status, ["queued", "running"])));
  const [result] = await tx
    .update(prospects)
    .set({
      researchStatus: ["queued", "running"].includes(p.researchStatus) ? "idle" : p.researchStatus,
      draftStatus: ["queued", "running"].includes(p.draftStatus) ? "idle" : p.draftStatus,
      ...values,
      version: p.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(prospects.id, p.id))
    .returning();
  return result!;
}

export function createSalesService(db: Database, config: SalesConfig) {
  return {
    async campaigns() {
      return db.select().from(campaigns).orderBy(desc(campaigns.createdAt));
    },
    async createCampaign(input: CampaignInput) {
      const [result] = await db
        .insert(campaigns)
        .values({ ...input, id: newId() })
        .returning();
      return result!;
    },
    async updateCampaign(id: string, version: number, input: CampaignInput, actor: string) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(713219)`);
        const [dispatching] = await tx
          .select({ id: emailOutbox.id })
          .from(emailOutbox)
          .innerJoin(prospects, eq(prospects.id, emailOutbox.prospectId))
          .where(
            and(
              eq(prospects.campaignId, id),
              inArray(emailOutbox.status, ["sending", "uncertain"]),
            ),
          );
        if (dispatching)
          conflict(
            "An email using this offer is being dispatched or awaiting confirmation. Resolve it before changing the offer.",
          );
        const [current] = await tx
          .select()
          .from(campaigns)
          .where(eq(campaigns.id, id))
          .for("update");
        if (!current) throw new AppError(404, "NOT_FOUND", "Campaign not found.");
        if (current.version !== version)
          conflict("This campaign changed. Refresh it before saving.");
        const [result] = await tx
          .update(campaigns)
          .set({ ...input, version: version + 1 })
          .where(eq(campaigns.id, id))
          .returning();
        const invalidated = await tx
          .update(prospects)
          .set({
            status: "review",
            approvalVersion: null,
            version: sql`${prospects.version} + 1`,
            updatedAt: new Date(),
          })
          .where(and(eq(prospects.campaignId, id), eq(prospects.status, "approved")))
          .returning({ id: prospects.id });
        if (invalidated.length)
          await tx
            .update(emailOutbox)
            .set({ status: "cancelled", lastError: "Offer changed; review and approve again." })
            .where(
              and(
                inArray(
                  emailOutbox.prospectId,
                  invalidated.map((p) => p.id),
                ),
                eq(emailOutbox.status, "queued"),
              ),
            );
        for (const p of invalidated)
          await logActivity(
            tx,
            p.id,
            "approval_invalidated",
            "Campaign changed; review the message again.",
            actor,
          );
        return result!;
      });
    },
    async list(query: {
      q?: string;
      status?: ProspectStatus;
      campaignId?: string;
      page?: number;
      due?: boolean;
    }) {
      const page = query.page || 1;
      const search = query.q?.trim().replace(/[\\%_]/g, "\\$&");
      const where = and(
        search
          ? or(
              ilike(prospects.name, `%${search}%`),
              ilike(prospects.domain, `%${search}%`),
              ilike(prospects.email, `%${search}%`),
            )
          : undefined,
        query.status ? eq(prospects.status, query.status) : undefined,
        query.campaignId ? eq(prospects.campaignId, query.campaignId) : undefined,
        query.due
          ? and(eq(prospects.status, "contacted"), lte(prospects.followUpAt, new Date()))
          : undefined,
      );
      const [data, totals] = await Promise.all([
        db
          .select()
          .from(prospects)
          .where(where)
          .orderBy(desc(prospects.updatedAt))
          .limit(50)
          .offset((page - 1) * 50),
        db.select({ value: count() }).from(prospects).where(where),
      ]);
      return { data, total: totals[0]!.value, page, pageSize: 50 };
    },
    async detail(id: string) {
      const [prospect] = await db.select().from(prospects).where(eq(prospects.id, id));
      if (!prospect) throw new AppError(404, "NOT_FOUND", "Prospect not found.");
      const history = await db
        .select()
        .from(activities)
        .where(eq(activities.prospectId, id))
        .orderBy(desc(activities.createdAt))
        .limit(50);
      const deliveries = await db
        .select()
        .from(emailOutbox)
        .where(eq(emailOutbox.prospectId, id))
        .orderBy(desc(emailOutbox.createdAt))
        .limit(20);
      return { prospect, activities: history, deliveries };
    },
    async createProspect(input: ProspectInput, actor: string) {
      return db.transaction(async (tx) => {
        const normalized = normalizeWebsite(input.website);
        await assertNotSuppressed(tx, { ...normalized, email: input.email, status: "new" });
        const [p] = await tx
          .insert(prospects)
          .values({
            ...input,
            ...normalized,
            id: newId(),
            sourceCapturedAt: input.sourceCapturedAt ? new Date(input.sourceCapturedAt) : null,
          })
          .onConflictDoNothing({ target: prospects.domain })
          .returning();
        if (!p) conflict("This business already exists in the workspace. Search for its domain.");
        await logActivity(
          tx,
          p.id,
          "created",
          input.sourceUrl ? "Imported with source provenance." : "Added to the workspace.",
          actor,
        );
        return p;
      });
    },
    async updateProspect(id: string, version: number, input: ProspectInput, actor: string) {
      return db.transaction(async (tx) => {
        const p = await lockProspect(tx, id, version);
        assertEditable(p);
        const normalized = normalizeWebsite(input.website);
        await assertNotSuppressed(tx, { ...normalized, email: input.email, status: p.status });
        const websiteChanged = p.website !== normalized.website;
        const result = await save(tx, p, {
          ...input,
          ...normalized,
          sourceCapturedAt: input.sourceCapturedAt ? new Date(input.sourceCapturedAt) : null,
          approvalVersion: null,
          verificationStatus: input.email === p.email ? p.verificationStatus : "unverified",
          status: p.draftBody ? "review" : "new",
          draftCampaignVersion: input.campaignId === p.campaignId ? p.draftCampaignVersion : null,
          ...(websiteChanged
            ? {
                research: null,
                evidence: [],
                researchStatus: "idle" as const,
                draftBody: "",
                draftSubject: "",
                score: null,
                draftEvidenceIds: [],
                status: "new" as const,
              }
            : {}),
        });
        await logActivity(tx, id, "updated", "Prospect details changed; approval cleared.", actor);
        return result;
      });
    },
    async addEvidence(
      id: string,
      version: number,
      input: Pick<Evidence, "url" | "title" | "text">,
      actor: string,
    ) {
      return db.transaction(async (tx) => {
        const p = await lockProspect(tx, id, version);
        assertEditable(p);
        if (p.evidence.length >= 30)
          throw new AppError(422, "EVIDENCE_LIMIT", "Keep up to 30 evidence items per prospect.");
        const item: Evidence = {
          ...input,
          id: newId(),
          kind: "manual",
          retrievedAt: new Date().toISOString(),
        };
        const result = await save(tx, p, {
          evidence: [...p.evidence, item],
          approvalVersion: null,
          status: p.draftBody ? "review" : "researched",
        });
        await logActivity(tx, id, "evidence_added", "A source observation was added.", actor);
        return result;
      });
    },
    async saveDraft(id: string, version: number, input: DraftInput, actor: string) {
      return db.transaction(async (tx) => {
        const p = await lockProspect(tx, id, version);
        assertEditable(p);
        await assertNotSuppressed(tx, p);
        if (!p.campaignId)
          throw new AppError(422, "CAMPAIGN_REQUIRED", "Choose a campaign before drafting.");
        const [campaign] = await tx.select().from(campaigns).where(eq(campaigns.id, p.campaignId));
        if (!campaign)
          throw new AppError(422, "CAMPAIGN_REQUIRED", "Choose a campaign before drafting.");
        let draft: DraftInput;
        try {
          draft = validateDraftEvidence(input, p.evidence);
        } catch (e) {
          throw new AppError(422, "INVALID_EVIDENCE", (e as Error).message);
        }
        const result = await save(tx, p, {
          score: draft.score,
          rationale: draft.rationale,
          draftSubject: draft.subject,
          draftBody: draft.body,
          draftEvidenceIds: draft.evidenceIds,
          draftModel: "Manual",
          draftCampaignVersion: campaign.version,
          approvalVersion: null,
          draftStatus: "complete",
          status: draft.score ? "review" : "skipped",
        });
        await logActivity(
          tx,
          id,
          "draft_saved",
          draft.score ? "Manual draft saved for review." : "No useful signal; prospect skipped.",
          actor,
        );
        return result;
      });
    },
    async action(
      id: string,
      version: number,
      action:
        | "approve"
        | "contacted"
        | "replied"
        | "meeting"
        | "close"
        | "skip"
        | "suppress"
        | "followed_up",
      actor: string,
    ) {
      return db.transaction(async (tx) => {
        // A workspace lock serializes contact logging with suppression and daily-cap checks.
        await tx.execute(sql`select pg_advisory_xact_lock(713219)`);
        const p = await lockProspect(tx, id, version, action === "suppress");
        if (action === "suppress") {
          const [dispatching] = await tx
            .select({ id: emailOutbox.id })
            .from(emailOutbox)
            .innerJoin(prospects, eq(prospects.id, emailOutbox.prospectId))
            .where(
              and(
                eq(emailOutbox.status, "sending"),
                or(
                  eq(prospects.domain, p.domain),
                  p.email ? eq(prospects.email, p.email) : undefined,
                ),
              ),
            );
          if (dispatching)
            conflict(
              "An email for this business or recipient is being dispatched. Wait for its result before suppressing it.",
            );
          await tx
            .insert(suppressions)
            .values({
              id: newId(),
              domain: p.domain,
              email: p.email,
              reason: "Manual do-not-contact request",
            })
            .onConflictDoNothing();
          const affected = await tx
            .update(prospects)
            .set({
              status: "suppressed",
              approvalVersion: null,
              followUpAt: null,
              researchStatus: sql`case when ${prospects.researchStatus} in ('queued', 'running') then 'idle' else ${prospects.researchStatus} end`,
              draftStatus: sql`case when ${prospects.draftStatus} in ('queued', 'running') then 'idle' else ${prospects.draftStatus} end`,
              version: sql`${prospects.version} + 1`,
              updatedAt: new Date(),
            })
            .where(
              or(
                eq(prospects.domain, p.domain),
                p.email ? eq(prospects.email, p.email) : undefined,
              ),
            )
            .returning({ id: prospects.id });
          await tx
            .update(jobs)
            .set({ status: "cancelled" })
            .where(
              and(
                inArray(jobs.status, ["queued", "running"]),
                inArray(
                  jobs.prospectId,
                  affected.map((row) => row.id),
                ),
              ),
            );
          if (affected.length)
            await tx
              .update(emailOutbox)
              .set({ status: "cancelled", lastError: "Business was suppressed." })
              .where(
                and(
                  inArray(
                    emailOutbox.prospectId,
                    affected.map((r) => r.id),
                  ),
                  eq(emailOutbox.status, "queued"),
                ),
              );
          for (const row of affected)
            await logActivity(
              tx,
              row.id,
              "suppressed",
              "Do not contact. Follow-ups stopped.",
              actor,
            );
          return (await tx.select().from(prospects).where(eq(prospects.id, id)))[0]!;
        }
        await assertNotSuppressed(tx, p);
        if (action === "approve") {
          assertEditable(p);
          if (!p.campaignId || !p.score || !p.draftBody || !p.draftEvidenceIds.length)
            throw new AppError(
              422,
              "DRAFT_REQUIRED",
              "Save a supported draft with a positive signal before approval.",
            );
          if (p.channel === "email" && (!p.email || !p.draftSubject))
            throw new AppError(
              422,
              "CONTACT_REQUIRED",
              "Add a recipient email and subject before approval.",
            );
          if (p.channel === "instagram" && !p.instagram)
            throw new AppError(
              422,
              "CONTACT_REQUIRED",
              "Add the Instagram profile before approval.",
            );
          const placeholders = unsupportedPlaceholders(`${p.draftSubject}\n${p.draftBody}`);
          if (placeholders.length)
            throw new AppError(
              422,
              "PLACEHOLDER",
              `Replace ${placeholders.join(", ")} before approval. Only {{sender}} is filled in automatically.`,
            );
          const [campaign] = await tx
            .select()
            .from(campaigns)
            .where(eq(campaigns.id, p.campaignId));
          if (campaign?.version !== p.draftCampaignVersion)
            conflict("The offer changed. Save or regenerate the draft before approving.");
          validateDraftEvidence(
            {
              score: p.score,
              rationale: p.rationale,
              evidenceIds: p.draftEvidenceIds,
              subject: p.draftSubject,
              body: p.draftBody,
            },
            p.evidence,
          );
          const result = await save(tx, p, { status: "approved", approvalVersion: p.version + 1 });
          await logActivity(
            tx,
            id,
            "approved",
            "This exact draft and recipient were approved. Nothing was sent.",
            actor,
          );
          return result;
        }
        if (action === "contacted" || action === "followed_up") {
          if (
            action === "contacted" &&
            (p.status !== "approved" || p.approvalVersion !== p.version)
          )
            conflict("Approve the current draft before recording a sent message.");
          if (action === "followed_up" && (p.status !== "contacted" || !p.followUpAt))
            conflict("There is no pending follow-up for this prospect.");
          const [queued] = await tx
            .select({ id: emailOutbox.id })
            .from(emailOutbox)
            .where(and(eq(emailOutbox.prospectId, p.id), eq(emailOutbox.status, "queued")));
          if (queued) conflict("Cancel the queued email before recording a manual send.");
          const capacity = await contactCapacity(tx, config.DAILY_CONTACT_LIMIT);
          if (capacity.count >= config.DAILY_CONTACT_LIMIT)
            throw new AppError(
              429,
              "DAILY_LIMIT",
              `The ${config.DAILY_CONTACT_LIMIT}-contact/send-attempt rolling 24-hour limit has been reached.`,
            );
          const result = await save(tx, p, {
            status: "contacted",
            approvalVersion: null,
            contactedAt: p.contactedAt || new Date(),
            followUpAt: action === "contacted" ? new Date(Date.now() + 7 * 86400000) : null,
          });
          await logActivity(
            tx,
            id,
            "contacted",
            action === "contacted"
              ? `Manually sent via ${p.channel}.`
              : "Manual follow-up recorded; no further reminders.",
            actor,
          );
          return result;
        }
        if (action === "replied" && p.status !== "contacted")
          conflict("Only contacted prospects can be marked replied.");
        if (action === "meeting" && !["contacted", "replied"].includes(p.status))
          conflict("Record the contact or reply before setting a meeting.");
        if (action === "skip") assertEditable(p);
        const status =
          action === "replied"
            ? "replied"
            : action === "meeting"
              ? "meeting"
              : action === "close"
                ? "closed"
                : "skipped";
        const result = await save(tx, p, { status, approvalVersion: null, followUpAt: null });
        await logActivity(
          tx,
          id,
          status,
          action === "meeting"
            ? "Meeting set; follow-up stopped."
            : action === "replied"
              ? "Reply received; follow-up stopped."
              : "Prospect removed from the active queue.",
          actor,
        );
        return result;
      });
    },
    async enqueue(id: string, version: number, kind: "research" | "draft", actor: string) {
      return db.transaction(async (tx) => {
        const p = await lockProspect(tx, id, version);
        assertEditable(p);
        await assertNotSuppressed(tx, p);
        const [active] = await tx
          .select()
          .from(jobs)
          .where(and(eq(jobs.prospectId, id), inArray(jobs.status, ["queued", "running"])));
        if (active) return p;
        if (kind === "draft" && !providerFor(config).key)
          throw new AppError(
            422,
            "AI_NOT_CONFIGURED",
            "Add a Groq or Gemini API key on the server, or write a manual draft.",
          );
        if (kind === "draft" && (!p.campaignId || !p.evidence.length))
          throw new AppError(
            422,
            "EVIDENCE_REQUIRED",
            "Choose an offer and collect evidence before drafting.",
          );
        const result = await save(tx, p, {
          approvalVersion: null,
          lastError: "",
          status: p.draftBody ? "review" : p.status,
          ...(kind === "research"
            ? { researchStatus: "queued" as const }
            : { draftStatus: "queued" as const }),
        });
        await tx
          .insert(jobs)
          .values({ id: newId(), prospectId: id, kind, inputVersion: result.version });
        await logActivity(
          tx,
          id,
          `${kind}_queued`,
          kind === "research" ? "Website research queued." : "Evidence-based draft queued.",
          actor,
        );
        return result;
      });
    },
    async cancelQueued(id: string, version: number, actor: string) {
      return db.transaction(async (tx) => {
        // Same lock order as the worker: cancellation must not race a job claim.
        await tx.execute(sql`select pg_advisory_xact_lock(713219)`);
        const p = await lockProspect(tx, id, version);
        const [queued] = await tx
          .select()
          .from(jobs)
          .where(and(eq(jobs.prospectId, id), eq(jobs.status, "queued")))
          .for("update");
        if (!queued)
          throw new AppError(
            409,
            "JOB_NOT_QUEUED",
            "The job has already started or finished. Refresh this prospect.",
          );
        await tx.update(jobs).set({ status: "cancelled", error: "" }).where(eq(jobs.id, queued.id));
        const result = await save(tx, p, {
          lastError: "",
          ...(queued.kind === "research"
            ? { researchStatus: "idle" as const }
            : { draftStatus: "idle" as const }),
        });
        await logActivity(
          tx,
          id,
          "job_cancelled",
          "Queued work cancelled; manual editing is available.",
          actor,
        );
        return result;
      });
    },
    async importRecords(
      records: Record<string, unknown>[],
      campaignId: string | null,
      actor: string,
    ) {
      let added = 0,
        duplicates = 0;
      const invalid: { row: number; reason: string }[] = [];
      for (const [i, row] of records.entries()) {
        const parsed = prospectInput.safeParse({
          ...row,
          campaignId,
          sourceUrl: row.sourceUrl || row.url || "",
          sourceCapturedAt: row.sourceCapturedAt || row.scrapedAt || null,
          notes:
            row.captureStatus === "list_only"
              ? `Maps capture: list information only; detail panel was not matched. Review contact information.\n${typeof row.notes === "string" ? row.notes : ""}`
              : row.notes,
        });
        if (!parsed.success) {
          invalid.push({ row: i + 1, reason: parsed.error.issues[0]?.message || "Invalid record" });
          continue;
        }
        try {
          await this.createProspect(parsed.data, actor);
          added++;
        } catch (error) {
          if (
            error instanceof AppError &&
            error.code === "CONFLICT" &&
            error.message.includes("already exists")
          )
            duplicates++;
          else if (error instanceof AppError) invalid.push({ row: i + 1, reason: error.message });
          else throw error;
        }
      }
      return { added, duplicates, invalid };
    },
    async overview() {
      const grouped = await db
        .select({ status: prospects.status, value: count() })
        .from(prospects)
        .groupBy(prospects.status);
      const counts = Object.fromEntries(grouped.map((row) => [row.status, row.value]));
      const [due, capacity] = await Promise.all([
        db
          .select({ value: count() })
          .from(prospects)
          .where(and(eq(prospects.status, "contacted"), lte(prospects.followUpAt, new Date()))),
        contactCapacity(db, config.DAILY_CONTACT_LIMIT),
      ]);
      return {
        total: grouped.reduce((n, row) => n + row.value, 0),
        review: counts.review || 0,
        approved: counts.approved || 0,
        contacted: counts.contacted || 0,
        due: due[0]!.value,
        contactedToday: capacity.count,
        replied: counts.replied || 0,
        meetings: counts.meeting || 0,
        dailyLimit: config.DAILY_CONTACT_LIMIT,
      };
    },
    async settings(viewer: Viewer) {
      const senders = await createMailboxService(db, config).list(viewer);
      const month = new Date();
      month.setUTCDate(1);
      month.setUTCHours(0, 0, 0, 0);
      const [usage] = await db
        .select({ value: sum(llmUsage.costMicros) })
        .from(llmUsage)
        .where(gte(llmUsage.createdAt, month));
      return {
        aiConfigured: Boolean(providerFor(config).key),
        provider: config.LLM_PROVIDER,
        model: providerFor(config).model,
        requestsPerMinute: config.LLM_RPM,
        requestsPerDay: config.LLM_RPD,
        tokensPerMinute: config.LLM_TPM,
        tokensPerDay: config.LLM_TPD,
        monthlyBudget: config.LLM_MONTHLY_BUDGET_USD,
        monthSpent: Number(usage?.value || 0) / 1e6,
        dailyLimit: config.DAILY_CONTACT_LIMIT,
        authMode: "Private team, database membership",
        emailSendingEnabled: config.EMAIL_SENDING_ENABLED && senders.length > 0,
        sendingSwitch: config.EMAIL_SENDING_ENABLED,
        mailboxes: senders,
        role: viewer.admin ? ("admin" as const) : ("member" as const),
        companyName: config.COMPANY_NAME,
      };
    },
  };
}
