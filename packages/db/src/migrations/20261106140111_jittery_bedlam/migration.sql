CREATE TABLE "lead_search" (
	"id" text PRIMARY KEY,
	"what" text NOT NULL,
	"location" text NOT NULL,
	"provider" text NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"found" integer DEFAULT 0 NOT NULL,
	"added" integer DEFAULT 0 NOT NULL,
	"duplicates" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"campaign_id" text,
	"actor" text NOT NULL,
	"error" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "lead_search_created_idx" ON "lead_search" ("created_at");--> statement-breakpoint
ALTER TABLE "lead_search" ADD CONSTRAINT "lead_search_campaign_id_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE SET NULL;