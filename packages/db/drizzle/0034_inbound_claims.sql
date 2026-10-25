ALTER TABLE "inbound_emails" ADD COLUMN "claimed_by" text;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "files_mail_external_idx" ON "files" USING btree ("owner_id","external_id") WHERE "files"."external_id" like 'mail:%';