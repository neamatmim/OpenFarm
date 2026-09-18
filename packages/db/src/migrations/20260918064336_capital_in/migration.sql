CREATE TABLE "venture_movement" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"venture_id" text NOT NULL,
	"kind" text NOT NULL,
	"agreement_id" text NOT NULL,
	"amount_bdt" numeric(12,2) NOT NULL,
	"moved_on" text NOT NULL,
	"reference" text NOT NULL,
	"refunds_id" text,
	"recorded_by" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "venture_movement_idx" ON "venture_movement" ("farm_id","venture_id");--> statement-breakpoint
CREATE UNIQUE INDEX "venture_movement_refunds_uidx" ON "venture_movement" ("refunds_id");--> statement-breakpoint
ALTER TABLE "venture_movement" ADD CONSTRAINT "venture_movement_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "venture_movement" ADD CONSTRAINT "venture_movement_venture_id_venture_id_fkey" FOREIGN KEY ("venture_id") REFERENCES "venture"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "venture_movement" ADD CONSTRAINT "venture_movement_agreement_id_investment_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "investment_agreement"("id");--> statement-breakpoint
ALTER TABLE "venture_movement" ADD CONSTRAINT "venture_movement_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");