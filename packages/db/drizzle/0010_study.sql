CREATE TABLE "study_cards" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"due" timestamp with time zone NOT NULL,
	"stability" real NOT NULL,
	"difficulty" real NOT NULL,
	"scheduled_days" integer NOT NULL,
	"learning_steps" integer NOT NULL,
	"reps" integer NOT NULL,
	"lapses" integer NOT NULL,
	"state" integer NOT NULL,
	"last_review" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "study_days" (
	"owner_id" text NOT NULL,
	"day" date NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_days_owner_id_day_pk" PRIMARY KEY("owner_id","day")
);
--> statement-breakpoint
CREATE TABLE "study_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"set_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"passage_id" text NOT NULL,
	"page" integer,
	"t_start" real,
	"kind" text NOT NULL,
	"topic" text NOT NULL,
	"prompt" text NOT NULL,
	"answer" text NOT NULL,
	"accepted" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quote" text NOT NULL,
	"why" text NOT NULL,
	"claim" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"check" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"item_id" uuid NOT NULL,
	"round_id" uuid,
	"outcome" text NOT NULL,
	"grade" integer NOT NULL,
	"hints" integer DEFAULT 0 NOT NULL,
	"tries" integer DEFAULT 1 NOT NULL,
	"answer" text,
	"ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"mode" text NOT NULL,
	"set_id" uuid,
	"day" date NOT NULL,
	"items" integer NOT NULL,
	"right" integer NOT NULL,
	"helped" integer NOT NULL,
	"shown" integer NOT NULL,
	"counted" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"scope" jsonb NOT NULL,
	"status" text DEFAULT 'generating' NOT NULL,
	"passages" integer DEFAULT 0 NOT NULL,
	"made" integer DEFAULT 0 NOT NULL,
	"dropped" integer DEFAULT 0 NOT NULL,
	"problem" text,
	"run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "study_sound" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "daily_new" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "streak_freezes" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "time_zone" text;--> statement-breakpoint
ALTER TABLE "study_cards" ADD CONSTRAINT "study_cards_item_id_study_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."study_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_cards" ADD CONSTRAINT "study_cards_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_days" ADD CONSTRAINT "study_days_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_items" ADD CONSTRAINT "study_items_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_items" ADD CONSTRAINT "study_items_set_id_study_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."study_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_items" ADD CONSTRAINT "study_items_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_reviews" ADD CONSTRAINT "study_reviews_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_reviews" ADD CONSTRAINT "study_reviews_item_id_study_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."study_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_rounds" ADD CONSTRAINT "study_rounds_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_rounds" ADD CONSTRAINT "study_rounds_set_id_study_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."study_sets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sets" ADD CONSTRAINT "study_sets_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "study_cards_due_idx" ON "study_cards" USING btree ("owner_id","due");--> statement-breakpoint
CREATE INDEX "study_items_set_idx" ON "study_items" USING btree ("set_id");--> statement-breakpoint
CREATE INDEX "study_items_owner_idx" ON "study_items" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "study_reviews_item_idx" ON "study_reviews" USING btree ("item_id","created_at");--> statement-breakpoint
CREATE INDEX "study_rounds_day_idx" ON "study_rounds" USING btree ("owner_id","day");--> statement-breakpoint
CREATE INDEX "study_sets_owner_idx" ON "study_sets" USING btree ("owner_id","created_at");