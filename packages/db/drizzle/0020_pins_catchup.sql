CREATE TABLE "space_pins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"message_id" text NOT NULL,
	"chat_id" uuid,
	"question" text NOT NULL,
	"body" text NOT NULL,
	"citations" jsonb NOT NULL,
	"quotes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "catchup_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "space_pins" ADD CONSTRAINT "space_pins_space_id_folders_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_pins" ADD CONSTRAINT "space_pins_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_pins" ADD CONSTRAINT "space_pins_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "space_pins_space_message_idx" ON "space_pins" USING btree ("space_id","message_id");--> statement-breakpoint
CREATE INDEX "space_pins_space_time_idx" ON "space_pins" USING btree ("space_id","created_at");