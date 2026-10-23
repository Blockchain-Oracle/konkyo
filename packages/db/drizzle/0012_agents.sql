CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"trigger" text NOT NULL,
	"found" integer DEFAULT 0 NOT NULL,
	"summary" text,
	"via" text,
	"trace_id" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_seen" (
	"agent_id" uuid NOT NULL,
	"doi" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_seen_agent_id_doi_pk" PRIMARY KEY("agent_id","doi")
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"scope" jsonb DEFAULT '{"fileIds":[],"folderIds":[]}'::jsonb NOT NULL,
	"schedule" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"zetaris_table" text,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_seen" ADD CONSTRAINT "agent_seen_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_agent_idx" ON "agent_runs" USING btree ("agent_id","started_at");--> statement-breakpoint
CREATE INDEX "agents_owner_idx" ON "agents" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "agents_due_idx" ON "agents" USING btree ("status","next_run_at");