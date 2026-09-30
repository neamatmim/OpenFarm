ALTER TABLE "handover" ADD COLUMN "buying_trip_id" text;--> statement-breakpoint
ALTER TABLE "handover" ADD COLUMN "float" text;--> statement-breakpoint
ALTER TABLE "buying_trip" ADD COLUMN "float_reconciled_at" timestamp;--> statement-breakpoint
ALTER TABLE "buying_trip" ADD COLUMN "float_reconciled_by" text;--> statement-breakpoint
ALTER TABLE "handover" ADD CONSTRAINT "handover_buying_trip_id_buying_trip_id_fkey" FOREIGN KEY ("buying_trip_id") REFERENCES "buying_trip"("id");--> statement-breakpoint
ALTER TABLE "buying_trip" ADD CONSTRAINT "buying_trip_float_reconciled_by_user_id_fkey" FOREIGN KEY ("float_reconciled_by") REFERENCES "user"("id");