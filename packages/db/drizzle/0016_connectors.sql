ALTER TYPE "public"."file_kind" ADD VALUE 'email';--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"toolkit" text NOT NULL,
	"account_id" text NOT NULL,
	"status" text DEFAULT 'initiated' NOT NULL,
	"label" text,
	"watch_query" text,
	"folder_id" uuid,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "connection_id" uuid;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "external_version" text;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connections_owner_idx" ON "connections" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_connection_idx" ON "files" USING btree ("connection_id","external_id");