CREATE TABLE "mailbox" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL UNIQUE,
	"email" text NOT NULL UNIQUE,
	"display_name" text NOT NULL,
	"secret" text NOT NULL,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_member" ADD COLUMN "role" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "mailbox" ADD CONSTRAINT "mailbox_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;