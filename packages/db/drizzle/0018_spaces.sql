CREATE TABLE "space_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"space_id" uuid NOT NULL,
	"actor_id" text,
	"kind" text NOT NULL,
	"subject_id" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "thumb_key" text;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "space_id" uuid;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "symbol" text;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "wall" text;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "cover_kind" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "cover_file_id" uuid;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "cover_key" text;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "template_id" text;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "inbound_token" text;--> statement-breakpoint
ALTER TABLE "space_events" ADD CONSTRAINT "space_events_space_id_folders_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_events" ADD CONSTRAINT "space_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "space_events_space_id_idx" ON "space_events" USING btree ("space_id","id");--> statement-breakpoint
CREATE INDEX "space_events_space_time_idx" ON "space_events" USING btree ("space_id","created_at");--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_cover_file_id_files_id_fk" FOREIGN KEY ("cover_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "folders_space_idx" ON "folders" USING btree ("space_id");--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_inboundToken_unique" UNIQUE("inbound_token");