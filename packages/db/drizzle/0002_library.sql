CREATE TYPE "public"."file_kind" AS ENUM('pdf', 'docx', 'pptx', 'markdown', 'text', 'web', 'youtube', 'audio', 'video');--> statement-breakpoint
CREATE TYPE "public"."file_problem" AS ENUM('locked_pdf', 'unsupported', 'unreachable', 'duplicate', 'no_text', 'failed');--> statement-breakpoint
CREATE TYPE "public"."file_status" AS ENUM('queued', 'processing', 'ready', 'needs_you');--> statement-breakpoint
CREATE TABLE "embedding_cache" (
	"hash" text PRIMARY KEY NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_folders" (
	"file_id" uuid NOT NULL,
	"folder_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_folders_file_id_folder_id_pk" PRIMARY KEY("file_id","folder_id")
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"kind" "file_kind" NOT NULL,
	"mime" text,
	"size_bytes" integer,
	"sha256" text,
	"source_url" text,
	"original_key" text,
	"rendition_key" text,
	"status" "file_status" DEFAULT 'queued' NOT NULL,
	"stage" text,
	"progress" real,
	"problem" "file_problem",
	"problem_detail" text,
	"duplicate_of_id" uuid,
	"from_scan" boolean DEFAULT false NOT NULL,
	"abstract_only" boolean DEFAULT false NOT NULL,
	"page_count" integer,
	"duration_seconds" real,
	"pages" jsonb,
	"meta" jsonb,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "passages" (
	"id" text PRIMARY KEY NOT NULL,
	"file_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"page" integer,
	"kind" text DEFAULT 'text' NOT NULL,
	"text" text NOT NULL,
	"char_start" integer,
	"char_end" integer,
	"bboxes" jsonb,
	"line_starts" jsonb,
	"t_start" real,
	"t_end" real,
	"speaker" text,
	"embedding" vector(1536),
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', text)) STORED
);
--> statement-breakpoint
ALTER TABLE "file_folders" ADD CONSTRAINT "file_folders_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_folders" ADD CONSTRAINT "file_folders_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_parent_id_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passages" ADD CONSTRAINT "passages_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passages" ADD CONSTRAINT "passages_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "file_folders_folder_idx" ON "file_folders" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "files_owner_created_idx" ON "files" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "files_owner_sha_idx" ON "files" USING btree ("owner_id","sha256");--> statement-breakpoint
CREATE INDEX "folders_owner_parent_idx" ON "folders" USING btree ("owner_id","parent_id");--> statement-breakpoint
CREATE INDEX "passages_file_idx" ON "passages" USING btree ("file_id","ordinal");--> statement-breakpoint
CREATE INDEX "passages_owner_idx" ON "passages" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "passages_embedding_idx" ON "passages" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "passages_tsv_idx" ON "passages" USING gin ("tsv");