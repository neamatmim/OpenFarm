CREATE TABLE "handover" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"from_user_id" text,
	"to_user_id" text,
	"amount_bdt" numeric(12,2) NOT NULL,
	"handed_at" timestamp NOT NULL,
	"reference" text,
	"note" text,
	"recorded_by" text NOT NULL,
	"recorded_by_role" text NOT NULL,
	"recorded_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "money_event" ADD COLUMN "held_by" text;--> statement-breakpoint
CREATE INDEX "handover_farm_idx" ON "handover" ("farm_id","handed_at");--> statement-breakpoint
CREATE INDEX "money_event_held_idx" ON "money_event" ("farm_id","held_by");--> statement-breakpoint
ALTER TABLE "handover" ADD CONSTRAINT "handover_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "handover" ADD CONSTRAINT "handover_from_user_id_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "handover" ADD CONSTRAINT "handover_to_user_id_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "handover" ADD CONSTRAINT "handover_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "money_event" ADD CONSTRAINT "money_event_held_by_user_id_fkey" FOREIGN KEY ("held_by") REFERENCES "user"("id");