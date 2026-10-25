CREATE TABLE "live_round_answers" (
	"round_id" uuid NOT NULL,
	"at" integer NOT NULL,
	"user_id" text NOT NULL,
	"choice" text NOT NULL,
	"right" boolean NOT NULL,
	"ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "live_round_answers_round_id_at_user_id_pk" PRIMARY KEY("round_id","at","user_id")
);
--> statement-breakpoint
CREATE TABLE "live_round_players" (
	"round_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "live_round_players_round_id_user_id_pk" PRIMARY KEY("round_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "live_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"host_id" text NOT NULL,
	"space_id" uuid,
	"set_id" uuid,
	"title" text NOT NULL,
	"questions" jsonb NOT NULL,
	"phase" text DEFAULT 'lobby' NOT NULL,
	"at" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"seconds" integer NOT NULL,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "live_rounds_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "live_round_answers" ADD CONSTRAINT "live_round_answers_round_id_live_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."live_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_round_answers" ADD CONSTRAINT "live_round_answers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_round_players" ADD CONSTRAINT "live_round_players_round_id_live_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."live_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_round_players" ADD CONSTRAINT "live_round_players_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_rounds" ADD CONSTRAINT "live_rounds_host_id_user_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_rounds" ADD CONSTRAINT "live_rounds_space_id_folders_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_rounds" ADD CONSTRAINT "live_rounds_set_id_study_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."study_sets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "live_round_players_user_idx" ON "live_round_players" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "live_rounds_host_idx" ON "live_rounds" USING btree ("host_id","created_at");