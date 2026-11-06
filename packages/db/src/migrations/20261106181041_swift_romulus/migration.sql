CREATE TABLE "api_usage" (
	"id" text PRIMARY KEY,
	"service" text NOT NULL,
	"ok" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prospect" ADD COLUMN "email_checked_at" timestamp;--> statement-breakpoint
ALTER TABLE "prospect" ADD COLUMN "opportunity" integer;--> statement-breakpoint
ALTER TABLE "prospect" ADD COLUMN "opportunity_reasons" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE INDEX "api_usage_service_created_idx" ON "api_usage" ("service","created_at");--> statement-breakpoint
CREATE INDEX "prospect_opportunity_idx" ON "prospect" ("opportunity");