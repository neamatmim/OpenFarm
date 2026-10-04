CREATE TABLE "financial_year_change" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"changing_from" text NOT NULL,
	"new_from" text NOT NULL,
	"reason" text NOT NULL,
	"recorded_by" text,
	"recorded_at" timestamp NOT NULL,
	"withdrawn_by" text,
	"withdrawn_at" timestamp,
	"withdrawn_reason" text
);
--> statement-breakpoint
CREATE INDEX "financial_year_change_farm_idx" ON "financial_year_change" ("farm_id","changing_from");--> statement-breakpoint
ALTER TABLE "financial_year_change" ADD CONSTRAINT "financial_year_change_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_year_change" ADD CONSTRAINT "financial_year_change_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "financial_year_change" ADD CONSTRAINT "financial_year_change_withdrawn_by_user_id_fkey" FOREIGN KEY ("withdrawn_by") REFERENCES "user"("id");