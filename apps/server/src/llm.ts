import { and, eq, gte, sql, sum } from "drizzle-orm";
import type { Database } from "@qublox-sales/db";
import { llmUsage, llmProviderState } from "@qublox-sales/db/schema/sales";
import type { CampaignInput, Evidence } from "@qublox-sales/shared";
import type { SalesConfig } from "./config";
import { AppError } from "./errors";
import {
  buildDraftRequest,
  estimateCost,
  LlmDeferred,
  MAX_OUTPUT,
  parseDraftResponse,
  providerFor,
  quotaWait,
  responseSchema,
  retryAt,
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
export async function generateDraft(
  db: Database,
  config: SalesConfig,
  jobId: string,
  prospect: { name: string; channel: string; evidence: Evidence[] },
  campaign: CampaignInput,
  fetcher: (url: string, init: RequestInit) => Promise<Response> = fetch,
) {
  const selected = providerFor(config);
  if (!selected.key)
    throw new AppError(
      422,
      "AI_NOT_CONFIGURED",
      "AI provider is not configured. You can write a manual draft.",
    );
  const request = buildDraftRequest(prospect, campaign, selected);
  // Byte-based input allowance plus protocol overhead is deliberately conservative.
  // Provider quotas/headers remain authoritative, including usage outside this app.
  const inputAllowance = Buffer.byteLength(JSON.stringify(request.messages)) + 512;
  const quotaTokens = inputAllowance + MAX_OUTPUT;
  const reservation = Math.max(1000, estimateCost(inputAllowance, MAX_OUTPUT, selected));
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(713220)`);
    // Admission begins after lock acquisition, using one clock across workers.
    const clock = await tx.execute<{ now: Date }>(sql`select clock_timestamp() as now`);
    const now = new Date(clock.rows[0]!.now);
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
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
    const wait = quotaWait(rows, config, now, quotaTokens, state?.blockedUntil || null);
    if (wait) throw new LlmDeferred(wait);
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
    await tx.insert(llmUsage).values({
      id,
      jobId,
      model: selected.model,
      provider: selected.provider,
      quotaTokens,
      costMicros: reservation,
      createdAt: now,
    });
  });
  // No SDK retries: ambiguous timeouts/5xx retain their reservation and need manual retry.
  const response = await fetcher(selected.endpoint, {
    method: "POST",
    signal: AbortSignal.timeout(45000),
    headers: { Authorization: `Bearer ${selected.key}`, "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const until = retryAt(response.headers, new Date(), response.status === 429, quotaTokens);
  if (until.getTime() > Date.now()) await cooldown(db, selected.provider, until);
  if (response.status === 429) {
    await response.body?.cancel().catch(() => {});
    await db.update(llmUsage).set({ costMicros: 0, state: "rejected" }).where(eq(llmUsage.id, id));
    throw new LlmDeferred(until, true);
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error(
      `AI provider request failed (HTTP ${response.status}). Check the selected model, API key and provider console.`,
    );
  }
  const raw = await boundedJson(response);
  // Account for reported tokens even when the generated JSON/evidence is rejected.
  const metering = responseSchema.safeParse(raw);
  if (metering.success && metering.data.usage) {
    const u = metering.data.usage;
    await db
      .update(llmUsage)
      .set({
        costMicros: estimateCost(u.prompt_tokens, u.completion_tokens, selected),
        state: "estimated",
        quotaTokens: Math.max(quotaTokens, u.prompt_tokens + u.completion_tokens),
      })
      .where(eq(llmUsage.id, id));
  }
  return parseDraftResponse(raw, prospect.evidence, selected).draft;
}
