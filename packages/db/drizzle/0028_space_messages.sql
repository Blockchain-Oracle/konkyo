CREATE TABLE "space_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"space_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"author_id" text,
	"asker_id" text,
	"body" text NOT NULL,
	"reply_to_id" text,
	"parts" jsonb,
	"status" text,
	"run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "space_messages" ADD CONSTRAINT "space_messages_space_id_folders_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_messages" ADD CONSTRAINT "space_messages_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_messages" ADD CONSTRAINT "space_messages_asker_id_user_id_fk" FOREIGN KEY ("asker_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "space_messages_space_idx" ON "space_messages" USING btree ("space_id","created_at");