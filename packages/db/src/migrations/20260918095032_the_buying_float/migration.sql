ALTER TABLE "venture_movement" ADD COLUMN "buying_trip_id" text;--> statement-breakpoint
ALTER TABLE "venture_movement" ALTER COLUMN "agreement_id" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "venture_movement_float_uidx" ON "venture_movement" ("buying_trip_id") WHERE "kind" = 'float_out';--> statement-breakpoint
ALTER TABLE "venture_movement" ADD CONSTRAINT "venture_movement_buying_trip_id_buying_trip_id_fkey" FOREIGN KEY ("buying_trip_id") REFERENCES "buying_trip"("id");