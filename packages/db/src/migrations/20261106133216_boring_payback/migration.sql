ALTER TABLE "prospect" ADD COLUMN "phone_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "suppression" ADD COLUMN "phone_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "prospect" ALTER COLUMN "website" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "prospect" ALTER COLUMN "domain" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "suppression" ALTER COLUMN "domain" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "prospect_phone_key_idx" ON "prospect" ("phone_key");--> statement-breakpoint
UPDATE "prospect" SET "phone_key" = right(regexp_replace("phone", '\D', '', 'g'), 10) WHERE length(regexp_replace("phone", '\D', '', 'g')) >= 8;
