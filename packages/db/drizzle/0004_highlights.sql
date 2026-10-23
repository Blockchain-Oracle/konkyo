CREATE TABLE "highlights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"file_id" uuid NOT NULL,
	"page" integer NOT NULL,
	"rects" jsonb NOT NULL,
	"text" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "highlights" ADD CONSTRAINT "highlights_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "highlights" ADD CONSTRAINT "highlights_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "highlights_file_idx" ON "highlights" USING btree ("file_id","page");--> statement-breakpoint
CREATE INDEX "highlights_owner_idx" ON "highlights" USING btree ("owner_id");