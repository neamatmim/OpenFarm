CREATE TABLE "wage_draw" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"counterparty_id" text NOT NULL,
	"amount_bdt" numeric(12,2) NOT NULL,
	"drawn_at" timestamp NOT NULL,
	"note" text,
	"recorded_by" text NOT NULL,
	"recorded_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wage_draw_taken" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"draw_id" text NOT NULL,
	"wage_event_id" text NOT NULL,
	"bdt" numeric(12,2) NOT NULL
);
--> statement-breakpoint
CREATE INDEX "wage_draw_person_idx" ON "wage_draw" ("farm_id","counterparty_id");--> statement-breakpoint
CREATE INDEX "wage_draw_taken_draw_idx" ON "wage_draw_taken" ("draw_id");--> statement-breakpoint
CREATE INDEX "wage_draw_taken_wage_idx" ON "wage_draw_taken" ("wage_event_id");--> statement-breakpoint
ALTER TABLE "wage_draw" ADD CONSTRAINT "wage_draw_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "wage_draw" ADD CONSTRAINT "wage_draw_counterparty_id_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparty"("id");--> statement-breakpoint
ALTER TABLE "wage_draw" ADD CONSTRAINT "wage_draw_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "wage_draw_taken" ADD CONSTRAINT "wage_draw_taken_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "wage_draw_taken" ADD CONSTRAINT "wage_draw_taken_draw_id_wage_draw_id_fkey" FOREIGN KEY ("draw_id") REFERENCES "wage_draw"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "wage_draw_taken" ADD CONSTRAINT "wage_draw_taken_wage_event_id_money_event_id_fkey" FOREIGN KEY ("wage_event_id") REFERENCES "money_event"("id") ON DELETE CASCADE;