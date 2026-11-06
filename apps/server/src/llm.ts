import { and, eq, gte, sql, sum } from "drizzle-orm";
import type { Database } from "@qublox-sales/db";
import { llmUsage, llmProviderState } from "@qublox-sales/db/schema/sales";
import type { CampaignInput, Evidence } from "@qublox-sales/shared";
import type { SalesConfig } from "./config";
import { AppError } from "./errors";
import {
  aiConfigured,
  backoffMs,
  buildDraftRequest,
  inputTokens,
  limitsFor,
  type Provider,
  providersFor,
  draftResponseSchema,
  estimateCost,
  type ModelRequest,
  LlmDeferred,
  MAX_OUTPUT,
  parseDraftResponse,
  quotaWait,
  responseSchema,
  retryAt,
  providerRequest,
  normalizeProviderResponse,
} from "./llm-provider";

async function cooldown(db: Database, provider: string, until: Date) {
  await db
    .insert(llmProviderState)
    .values({ provider, blockedUntil: until })
    .onConflictDoUpdate({
      target: llmProviderState.provider,
      set: {
        blockedUntil: sql`greatest(${llmProviderState.blockedUntil}, ${until.toISOString()}::timestamp)`,
      },
    });
}
async function boundedJson(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("AI provider returned an empty response.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > 64000) throw new Error("AI response exceeded its size limit.");
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}
type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
export type DraftContext = {
  name: string;
  channel: string;
  evidence: Evidence[];
  contactName?: string;
};

// Drafts one message. If the first provider's answer is unusable (bad JSON, uncited
// evidence), the other provider gets one try before the error is reported.
export async function generateDraft(
  db: Database,
  config: SalesConfig,
  jobId: string,
  prospect: DraftContext,
  campaign: CampaignInput,
  fetcher: Fetcher = fetch,
) {
  const build = (p: Provider) => buildDraftRequest(prospect, campaign, p, config.COMPANY_NAME);
  const finish = ({ raw, selected }: ModelResult) => ({
    ...parseDraftResponse(raw, prospect.evidence, selected, config.COMPANY_NAME).draft,
    model: `${selected.provider} / ${selected.model}`,
  });
  const first = await callModel(db, config, jobId, build, draftResponseSchema, fetcher);
  try {
    return finish(first);
  } catch (error) {
    if (!providersFor(config).some((p) => p.provider !== first.selected.provider)) throw error;
    try {
      return finish(
        await callModel(db, config, jobId, build, draftResponseSchema, fetcher, [
          first.selected.provider,
        ]),
      );
    } catch {
      throw error;
    }
  }
}

export type ModelResult = { raw: unknown; selected: Provider };
type Admitted = { selected: Provider; request: ModelRequest; id: string; quotaTokens: number };

// Picks the provider to use: the least recently used one that has capacity right now, so
// requests alternate between Groq and Gemini. Throws LlmDeferred with the earliest time any
// remaining provider frees up.
async function admit(
  db: Database,
  config: SalesConfig,
  ledgerId: string,
  build: (p: Provider) => ModelRequest,
  skip: Set<string>,
): Promise<Admitted | null> {
  const candidates = providersFor(config).filter((p) => !skip.has(p.provider));
  if (!candidates.length) return null;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(713220)`);
    // Admission begins after lock acquisition, using one clock across workers.
    const clock = await tx.execute<{ now: Date }>(sql`select clock_timestamp() as now`);
    const now = new Date(clock.rows[0]!.now);
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const options = [];
    for (const selected of candidates) {
      const [state] = await tx
        .select()
        .from(llmProviderState)
        .where(eq(llmProviderState.provider, selected.provider));
      const rows = await tx
        .select({ createdAt: llmUsage.createdAt, quotaTokens: llmUsage.quotaTokens })
        .from(llmUsage)
        .where(
          and(
            eq(llmUsage.provider, selected.provider),
            gte(llmUsage.createdAt, new Date(now.getTime() - 86400000)),
          ),
        );
      const request = build(selected);
      const quotaTokens = inputTokens(request.messages) + MAX_OUTPUT;
      let wait: Date | null;
      try {
        wait = quotaWait(
          rows,
          limitsFor(config, selected.provider),
          now,
          quotaTokens,
          state?.blockedUntil || null,
        );
      } catch (error) {
        if (candidates.length === 1) throw error;
        continue;
      }
      const lastUsed = Math.max(0, ...rows.map((r) => r.createdAt.getTime()));
      options.push({ selected, request, quotaTokens, wait, lastUsed });
    }
    if (!options.length) throw new Error("AI token limit is below this bounded request size.");
    const ready = options.filter((o) => !o.wait).sort((a, b) => a.lastUsed - b.lastUsed)[0];
    if (!ready) throw new LlmDeferred(new Date(Math.min(...options.map((o) => o.wait!.getTime()))));
    const { selected, request, quotaTokens } = ready;
    const reservation = Math.max(
      1000,
      estimateCost(quotaTokens - MAX_OUTPUT, MAX_OUTPUT, selected),
    );
    const [spent] = await tx
      .select({ amount: sum(llmUsage.costMicros) })
      .from(llmUsage)
      .where(gte(llmUsage.createdAt, month));
    if (Number(spent?.amount || 0) + reservation > config.LLM_MONTHLY_BUDGET_USD * 1e6)
      throw new AppError(
        422,
        "LLM_BUDGET",
        "The monthly drafting allowance is used. Write a manual draft or adjust your AI budget.",
      );
    const id = crypto.randomUUID();
    await tx.insert(llmUsage).values({
      id,
      jobId: ledgerId,
      model: selected.model,
      provider: selected.provider,
      quotaTokens,
      costMicros: reservation,
      createdAt: now,
    });
    return { selected, request, id, quotaTokens };
  });
}

async function recentRejections(db: Database, provider: string, id: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(llmUsage)
    .where(
      and(
        eq(llmUsage.provider, provider),
        eq(llmUsage.state, "rejected"),
        gte(llmUsage.createdAt, new Date(Date.now() - 30 * 60000)),
        sql`${llmUsage.id} <> ${id}`,
      ),
    );
  return row?.n || 0;
}

// One paced, metered model call shared by drafting and offer polishing. Returns the
// provider response normalized to the chat-completions shape.
// Rate limits (429) back off that provider exponentially; outages (5xx, timeouts) pause it
// for 2 minutes. Either way the other provider is tried straight away when it has capacity.
export async function callModel(
  db: Database,
  config: SalesConfig,
  ledgerId: string,
  build: (p: Provider) => ModelRequest,
  geminiSchema: object,
  fetcher: Fetcher = fetch,
  exclude: string[] = [],
): Promise<ModelResult> {
  if (!aiConfigured(config))
    throw new AppError(
      422,
      "AI_NOT_CONFIGURED",
      "AI provider is not configured. You can write a manual draft.",
    );
  const tried = new Set(exclude);
  let retryAfter: Date | null = null;
  let failure: Error | null = null;
  const pause = (until: Date) => {
    if (!retryAfter || until < retryAfter) retryAfter = until;
  };
  while (true) {
    let admitted: Admitted | null;
    try {
      admitted = await admit(db, config, ledgerId, build, tried);
    } catch (error) {
      // Nothing else is free yet; retry when the earliest provider is.
      if (error instanceof LlmDeferred && (retryAfter || failure)) {
        pause(error.retryAt);
        throw new LlmDeferred(retryAfter!, true);
      }
      throw error;
    }
    if (!admitted) {
      if (retryAfter) throw new LlmDeferred(retryAfter, true);
      throw failure || new Error("AI provider is not available.");
    }
    const { selected, request, id, quotaTokens } = admitted;
    tried.add(selected.provider);
    const wire = providerRequest(request, selected, geminiSchema);
    let response: Response;
    try {
      response = await fetcher(selected.endpoint, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(45000),
        headers: wire.headers,
        body: JSON.stringify(wire.body),
      });
    } catch {
      // Timeout or network failure: the request may have been billed, so the reservation stays.
      const until = new Date(Date.now() + 120000);
      await cooldown(db, selected.provider, until);
      pause(until);
      continue;
    }
    if (response.status === 429) {
      await response.body?.cancel().catch(() => {});
      const strikes = await recentRejections(db, selected.provider, id);
      const until = new Date(
        Math.max(
          retryAt(response.headers, new Date(), true, quotaTokens).getTime(),
          Date.now() + backoffMs(strikes),
        ),
      );
      await cooldown(db, selected.provider, until);
      await db
        .update(llmUsage)
        .set({ costMicros: 0, state: "rejected" })
        .where(eq(llmUsage.id, id));
      pause(until);
      continue;
    }
    const until = retryAt(response.headers, new Date(), false, quotaTokens);
    if (until.getTime() > Date.now()) await cooldown(db, selected.provider, until);
    if (!response.ok) {
      // Log the provider's error code (never the prompt) so failures can be told apart,
      // e.g. Groq's json_validate_failed versus a bad key.
      const detail = await response
        .text()
        .then((t) => t.slice(0, 2000))
        .catch(() => "");
      console.error(
        JSON.stringify({
          event: "ai_provider_error",
          provider: selected.provider,
          status: response.status,
          code: detail.match(/"(?:code|status)"\s*:\s*"([\w.-]{1,60})"/)?.[1] || "",
        }),
      );
      if ([400, 401, 403, 404, 422].includes(response.status)) {
        await db
          .update(llmUsage)
          .set({ costMicros: 0, state: "rejected" })
          .where(eq(llmUsage.id, id));
        failure ||= new Error(
          `AI provider request failed (HTTP ${response.status}). Check the selected model, API key and provider console.`,
        );
      } else {
        const pauseUntil = new Date(Date.now() + 120000);
        await cooldown(db, selected.provider, pauseUntil);
        pause(pauseUntil);
      }
      continue;
    }
    const raw = normalizeProviderResponse(await boundedJson(response), selected);
    // Account for reported tokens even when the generated JSON/evidence is rejected.
    const metering = responseSchema.safeParse(raw);
    if (metering.success && metering.data.usage) {
      const u = metering.data.usage;
      await db
        .update(llmUsage)
        .set({
          costMicros: estimateCost(u.prompt_tokens, u.completion_tokens, selected),
          state: "estimated",
          quotaTokens: u.prompt_tokens + u.completion_tokens,
        })
        .where(eq(llmUsage.id, id));
    }
    return { raw, selected };
  }
}
