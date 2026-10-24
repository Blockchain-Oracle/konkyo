CREATE TABLE "space_takes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"passage_id" uuid,
	"page" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "space_takes" ADD CONSTRAINT "space_takes_space_id_folders_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_takes" ADD CONSTRAINT "space_takes_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_takes" ADD CONSTRAINT "space_takes_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "space_takes_file_idx" ON "space_takes" USING btree ("space_id","file_id","created_at");