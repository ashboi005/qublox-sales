CREATE TABLE "llm_provider_state" (
	"provider" text PRIMARY KEY,
	"blocked_until" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "llm_usage" ADD COLUMN "provider" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_usage" ADD COLUMN "quota_tokens" integer DEFAULT 0 NOT NULL;