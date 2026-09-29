CREATE TABLE "baki_write_off" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"counterparty_id" text NOT NULL,
	"amount_bdt" numeric(12,2) NOT NULL,
	"reason" text NOT NULL,
	"written_on" text NOT NULL,
	"recorded_by" text,
	"recorded_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "baki_write_off_source_idx" ON "baki_write_off" ("farm_id","source","source_id");--> statement-breakpoint
ALTER TABLE "baki_write_off" ADD CONSTRAINT "baki_write_off_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "baki_write_off" ADD CONSTRAINT "baki_write_off_counterparty_id_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparty"("id");--> statement-breakpoint
ALTER TABLE "baki_write_off" ADD CONSTRAINT "baki_write_off_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");