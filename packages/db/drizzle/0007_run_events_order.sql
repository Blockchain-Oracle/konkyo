DROP INDEX "run_events_run_seq_idx";--> statement-breakpoint
CREATE INDEX "run_events_run_idx" ON "run_events" USING btree ("run_id","id");--> statement-breakpoint
ALTER TABLE "run_events" DROP COLUMN "seq";