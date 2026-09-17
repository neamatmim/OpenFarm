CREATE TABLE "buying_trip" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"went_to" text NOT NULL,
	"broker_bdt" numeric(12,2) DEFAULT '0' NOT NULL,
	"transport_bdt" numeric(12,2) DEFAULT '0' NOT NULL,
	"keep_bdt" numeric(12,2) DEFAULT '0' NOT NULL,
	"went_on" timestamp NOT NULL,
	"recorded_by" text,
	"recorded_by_role" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "intake" ADD COLUMN "buying_trip_id" text;--> statement-breakpoint
CREATE INDEX "buying_trip_day_idx" ON "buying_trip" ("farm_id","went_on");--> statement-breakpoint
ALTER TABLE "buying_trip" ADD CONSTRAINT "buying_trip_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "buying_trip" ADD CONSTRAINT "buying_trip_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "intake" ADD CONSTRAINT "intake_buying_trip_id_buying_trip_id_fkey" FOREIGN KEY ("buying_trip_id") REFERENCES "buying_trip"("id");