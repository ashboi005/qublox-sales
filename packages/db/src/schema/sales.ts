import { pgTable, text, timestamp, integer, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { Evidence, Research, Channel, ProspectStatus } from "@qublox-sales/shared";

export const campaigns = pgTable("campaign", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  audience: text("audience").notNull(),
  offer: text("offer").notNull(),
  proof: text("proof").notNull().default(""),
  callToAction: text("call_to_action").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const prospects = pgTable(
  "prospect",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    website: text("website").notNull().default(""),
    // Null when the business has no website; phone_key then deduplicates.
    domain: text("domain").unique(),
    email: text("email"),
    phone: text("phone").notNull().default(""),
    phoneKey: text("phone_key").notNull().default(""),
    contactName: text("contact_name").notNull().default(""),
    country: text("country").notNull().default(""),
    instagram: text("instagram").notNull().default(""),
    campaignId: text("campaign_id").references(() => campaigns.id),
    channel: text("channel").$type<Channel>().notNull().default("email"),
    sourceUrl: text("source_url").notNull().default(""),
    notes: text("notes").notNull().default(""),
    sourceCapturedAt: timestamp("source_captured_at"),
    address: text("address").notNull().default(""),
    version: integer("version").notNull().default(1),
    status: text("status").$type<ProspectStatus>().notNull().default("new"),
    researchStatus: text("research_status")
      .$type<"idle" | "queued" | "running" | "complete" | "failed">()
      .notNull()
      .default("idle"),
    draftStatus: text("draft_status")
      .$type<"idle" | "queued" | "running" | "complete" | "failed">()
      .notNull()
      .default("idle"),
    research: jsonb("research").$type<Research | null>(),
    evidence: jsonb("evidence").$type<Evidence[]>().notNull().default([]),
    score: integer("score"),
    rationale: text("rationale").notNull().default(""),
    draftSubject: text("draft_subject").notNull().default(""),
    draftBody: text("draft_body").notNull().default(""),
    draftEvidenceIds: jsonb("draft_evidence_ids").$type<string[]>().notNull().default([]),
    draftModel: text("draft_model").notNull().default(""),
    approvalVersion: integer("approval_version"),
    draftCampaignVersion: integer("draft_campaign_version"),
    verificationStatus: text("verification_status")
      .$type<"unverified" | "unknown" | "valid" | "invalid" | "catch_all">()
      .notNull()
      .default("unverified"),
    // When the email was last checked with the verification service (on demand only).
    emailCheckedAt: timestamp("email_checked_at"),
    // 0-100: how much a web studio could plausibly help, from the audit and listing.
    opportunity: integer("opportunity"),
    opportunityReasons: jsonb("opportunity_reasons").$type<string[]>().notNull().default([]),
    lastError: text("last_error").notNull().default(""),
    contactedAt: timestamp("contacted_at"),
    followUpAt: timestamp("follow_up_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("prospect_status_idx").on(table.status),
    index("prospect_follow_up_idx").on(table.followUpAt),
    index("prospect_phone_key_idx").on(table.phoneKey),
    index("prospect_opportunity_idx").on(table.opportunity),
  ],
);

export const activities = pgTable(
  "activity",
  {
    id: text("id").primaryKey(),
    prospectId: text("prospect_id")
      .notNull()
      .references(() => prospects.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    detail: text("detail").notNull(),
    actor: text("actor").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("activity_prospect_idx").on(table.prospectId)],
);

export const suppressions = pgTable("suppression", {
  id: text("id").primaryKey(),
  domain: text("domain").unique(),
  email: text("email"),
  phoneKey: text("phone_key").notNull().default(""),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const jobs = pgTable(
  "job",
  {
    id: text("id").primaryKey(),
    prospectId: text("prospect_id")
      .notNull()
      .references(() => prospects.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"research" | "draft">().notNull(),
    status: text("status")
      .$type<"queued" | "running" | "done" | "failed" | "cancelled">()
      .notNull()
      .default("queued"),
    inputVersion: integer("input_version").notNull(),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at").notNull().defaultNow(),
    lockedAt: timestamp("locked_at"),
    leaseId: text("lease_id"),
    error: text("error").notNull().default(""),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("job_claim_idx").on(table.status, table.availableAt),
    uniqueIndex("job_one_active_idx")
      .on(table.prospectId)
      .where(sql`${table.status} in ('queued', 'running')`),
  ],
);

export const llmUsage = pgTable("llm_usage", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull(),
  model: text("model").notNull(),
  provider: text("provider").notNull().default("legacy"),
  quotaTokens: integer("quota_tokens").notNull().default(0),
  costMicros: integer("cost_micros").notNull(),
  state: text("state").notNull().default("reserved"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const llmProviderState = pgTable("llm_provider_state", {
  provider: text("provider").primaryKey(),
  blockedUntil: timestamp("blocked_until").notNull(),
});

// One row per "Find leads" run, for history and the monthly Places allowance.
export const leadSearches = pgTable(
  "lead_search",
  {
    id: text("id").primaryKey(),
    what: text("what").notNull(),
    location: text("location").notNull(),
    provider: text("provider").$type<"google" | "openstreetmap">().notNull(),
    requests: integer("requests").notNull().default(0),
    found: integer("found").notNull().default(0),
    added: integer("added").notNull().default(0),
    duplicates: integer("duplicates").notNull().default(0),
    skipped: integer("skipped").notNull().default(0),
    campaignId: text("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    actor: text("actor").notNull(),
    error: text("error").notNull().default(""),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("lead_search_created_idx").on(table.createdAt)],
);

// Calls to free-tier services (email verification, page readers, PageSpeed), so monthly
// allowances can be enforced locally before a provider would start charging.
export const apiUsage = pgTable(
  "api_usage",
  {
    id: text("id").primaryKey(),
    service: text("service").$type<"reoon" | "jina" | "firecrawl" | "pagespeed">().notNull(),
    ok: integer("ok").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("api_usage_service_created_idx").on(table.service, table.createdAt)],
);
