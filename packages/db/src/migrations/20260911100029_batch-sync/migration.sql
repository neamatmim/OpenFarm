CREATE TABLE "sync_batch" (
	"key" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"request_hash" text NOT NULL,
	"response" jsonb,
	"received_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_entry" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"source_key" text NOT NULL,
	"seq" integer NOT NULL,
	"kind" text NOT NULL,
	"outcome" text NOT NULL,
	"batch_key" text NOT NULL,
	"recorded_at" timestamp NOT NULL,
	"received_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "clock_skew_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
CREATE INDEX "sync_batch_farm_idx" ON "sync_batch" ("farm_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_entry_seq_uidx" ON "sync_entry" ("source_key","seq");--> statement-breakpoint
CREATE INDEX "sync_entry_source_idx" ON "sync_entry" ("farm_id","source_key","seq");--> statement-breakpoint
ALTER TABLE "sync_batch" ADD CONSTRAINT "sync_batch_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sync_batch" ADD CONSTRAINT "sync_batch_actor_id_user_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "sync_entry" ADD CONSTRAINT "sync_entry_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sync_entry" ADD CONSTRAINT "sync_entry_batch_key_sync_batch_key_fkey" FOREIGN KEY ("batch_key") REFERENCES "sync_batch"("key") ON DELETE CASCADE;