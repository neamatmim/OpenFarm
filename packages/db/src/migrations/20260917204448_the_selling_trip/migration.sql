CREATE TABLE "selling_trip" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"went_to" text NOT NULL,
	"transport_bdt" numeric(12,2) DEFAULT '0' NOT NULL,
	"keep_bdt" numeric(12,2) DEFAULT '0' NOT NULL,
	"went_on" timestamp NOT NULL,
	"recorded_by" text,
	"recorded_by_role" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "selling_trip_animal" (
	"selling_trip_id" text,
	"animal_id" text,
	CONSTRAINT "selling_trip_animal_pkey" PRIMARY KEY("selling_trip_id","animal_id")
);
--> statement-breakpoint
CREATE INDEX "selling_trip_day_idx" ON "selling_trip" ("farm_id","went_on");--> statement-breakpoint
ALTER TABLE "selling_trip" ADD CONSTRAINT "selling_trip_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "selling_trip" ADD CONSTRAINT "selling_trip_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "selling_trip_animal" ADD CONSTRAINT "selling_trip_animal_selling_trip_id_selling_trip_id_fkey" FOREIGN KEY ("selling_trip_id") REFERENCES "selling_trip"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "selling_trip_animal" ADD CONSTRAINT "selling_trip_animal_animal_id_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animal"("id");