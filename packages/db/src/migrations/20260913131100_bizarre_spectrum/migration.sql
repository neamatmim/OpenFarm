CREATE TABLE "campaign_lot_number" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"instance_id" text NOT NULL,
	"lot_number" text NOT NULL,
	"completion_id" text NOT NULL,
	"recorded_by" text,
	"recorded_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drug_product" ADD COLUMN "vaccine" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "treatment" ADD COLUMN "lot_number" text;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_lot_number_instance_uidx" ON "campaign_lot_number" ("instance_id");--> statement-breakpoint
ALTER TABLE "campaign_lot_number" ADD CONSTRAINT "campaign_lot_number_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "campaign_lot_number" ADD CONSTRAINT "campaign_lot_number_instance_id_sop_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "sop_instance"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "campaign_lot_number" ADD CONSTRAINT "campaign_lot_number_completion_id_step_completion_id_fkey" FOREIGN KEY ("completion_id") REFERENCES "step_completion"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "campaign_lot_number" ADD CONSTRAINT "campaign_lot_number_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");