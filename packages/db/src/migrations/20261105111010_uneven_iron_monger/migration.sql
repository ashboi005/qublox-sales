CREATE TABLE "account" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity" (
	"id" text PRIMARY KEY,
	"prospect_id" text NOT NULL,
	"kind" text NOT NULL,
	"detail" text NOT NULL,
	"actor" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"audience" text NOT NULL,
	"offer" text NOT NULL,
	"proof" text DEFAULT '' NOT NULL,
	"call_to_action" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job" (
	"id" text PRIMARY KEY,
	"prospect_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"input_version" integer NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp DEFAULT now() NOT NULL,
	"locked_at" timestamp,
	"lease_id" text,
	"error" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_usage" (
	"id" text PRIMARY KEY,
	"job_id" text NOT NULL,
	"model" text NOT NULL,
	"cost_micros" integer NOT NULL,
	"state" text DEFAULT 'reserved' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"website" text NOT NULL,
	"domain" text NOT NULL UNIQUE,
	"email" text,
	"phone" text DEFAULT '' NOT NULL,
	"contact_name" text DEFAULT '' NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"instagram" text DEFAULT '' NOT NULL,
	"campaign_id" text,
	"channel" text DEFAULT 'email' NOT NULL,
	"source_url" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"source_captured_at" timestamp,
	"address" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"research_status" text DEFAULT 'idle' NOT NULL,
	"draft_status" text DEFAULT 'idle' NOT NULL,
	"research" jsonb,
	"evidence" jsonb DEFAULT '[]' NOT NULL,
	"score" integer,
	"rationale" text DEFAULT '' NOT NULL,
	"draft_subject" text DEFAULT '' NOT NULL,
	"draft_body" text DEFAULT '' NOT NULL,
	"draft_evidence_ids" jsonb DEFAULT '[]' NOT NULL,
	"draft_model" text DEFAULT '' NOT NULL,
	"approval_version" integer,
	"draft_campaign_version" integer,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"last_error" text DEFAULT '' NOT NULL,
	"contacted_at" timestamp,
	"follow_up_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppression" (
	"id" text PRIMARY KEY,
	"domain" text NOT NULL UNIQUE,
	"email" text,
	"reason" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");--> statement-breakpoint
CREATE INDEX "activity_prospect_idx" ON "activity" ("prospect_id");--> statement-breakpoint
CREATE INDEX "job_claim_idx" ON "job" ("status","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "job_one_active_idx" ON "job" ("prospect_id") WHERE "status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "prospect_status_idx" ON "prospect" ("status");--> statement-breakpoint
CREATE INDEX "prospect_follow_up_idx" ON "prospect" ("follow_up_at");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_prospect_id_prospect_id_fkey" FOREIGN KEY ("prospect_id") REFERENCES "prospect"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_prospect_id_prospect_id_fkey" FOREIGN KEY ("prospect_id") REFERENCES "prospect"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "prospect" ADD CONSTRAINT "prospect_campaign_id_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id");