CREATE TABLE "email_outbox" (
	"id" text PRIMARY KEY,
	"prospect_id" text NOT NULL,
	"input_version" integer NOT NULL,
	"sender_pool" jsonb NOT NULL,
	"sender_id" text,
	"to_address" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"started_at" timestamp,
	"sent_at" timestamp,
	"message_id" text DEFAULT '' NOT NULL,
	"last_error" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "email_due_idx" ON "email_outbox" ("status","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_one_pending_idx" ON "email_outbox" ("prospect_id") WHERE "status" in ('queued','sending','uncertain');--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_prospect_id_prospect_id_fkey" FOREIGN KEY ("prospect_id") REFERENCES "prospect"("id") ON DELETE CASCADE;