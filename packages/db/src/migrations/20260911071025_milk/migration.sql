CREATE TABLE "milk_record" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"session_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"completion_id" text NOT NULL,
	"litres" numeric(6,2) NOT NULL,
	"destination" text NOT NULL,
	"forced" boolean DEFAULT false NOT NULL,
	"lactation_number" integer,
	"recorded_by" text NOT NULL,
	"recorded_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milking_session" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"instance_id" text NOT NULL,
	"pen_id" text NOT NULL,
	"due_at" timestamp NOT NULL,
	"bulk_litres" numeric(10,2),
	"sum_bulk_litres" numeric(10,2),
	"difference_litres" numeric(10,2),
	"tolerance_percent" integer,
	"flagged_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "milk_tolerance_percent" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "animal" ADD COLUMN "lactation_number" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "animal" ADD COLUMN "lactation_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "animal" ADD COLUMN "milk_withdrawal_until" timestamp;--> statement-breakpoint
ALTER TABLE "step_completion" ADD COLUMN "destination" text;--> statement-breakpoint
CREATE UNIQUE INDEX "milk_record_completion_uidx" ON "milk_record" ("completion_id");--> statement-breakpoint
CREATE INDEX "milk_record_animal_idx" ON "milk_record" ("farm_id","animal_id","recorded_at");--> statement-breakpoint
CREATE INDEX "milk_record_session_idx" ON "milk_record" ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "milking_session_instance_uidx" ON "milking_session" ("instance_id");--> statement-breakpoint
CREATE INDEX "milking_session_pen_idx" ON "milking_session" ("farm_id","pen_id","due_at");--> statement-breakpoint
ALTER TABLE "milk_record" ADD CONSTRAINT "milk_record_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "milk_record" ADD CONSTRAINT "milk_record_session_id_milking_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "milking_session"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "milk_record" ADD CONSTRAINT "milk_record_animal_id_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animal"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "milk_record" ADD CONSTRAINT "milk_record_completion_id_step_completion_id_fkey" FOREIGN KEY ("completion_id") REFERENCES "step_completion"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "milk_record" ADD CONSTRAINT "milk_record_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "milking_session" ADD CONSTRAINT "milking_session_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "milking_session" ADD CONSTRAINT "milking_session_instance_id_sop_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "sop_instance"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "milking_session" ADD CONSTRAINT "milking_session_pen_id_pen_id_fkey" FOREIGN KEY ("pen_id") REFERENCES "pen"("id");