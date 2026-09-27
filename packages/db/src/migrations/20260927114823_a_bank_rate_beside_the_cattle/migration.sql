CREATE TABLE "bank_rate" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"per_year" numeric(5,2) NOT NULL,
	"note" text NOT NULL,
	"from_day" text NOT NULL,
	"recorded_by" text,
	"recorded_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "bank_rate_farm_idx" ON "bank_rate" ("farm_id","from_day");--> statement-breakpoint
ALTER TABLE "bank_rate" ADD CONSTRAINT "bank_rate_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "bank_rate" ADD CONSTRAINT "bank_rate_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");