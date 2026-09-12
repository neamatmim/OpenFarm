CREATE TABLE "pregnancy_check" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"completion_id" text NOT NULL,
	"service_id" text NOT NULL,
	"result" text NOT NULL,
	"checked_at" timestamp NOT NULL,
	"recorded_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "pregnancy_check_after_days" integer DEFAULT 45 NOT NULL;--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "gestation_days" integer DEFAULT 283 NOT NULL;--> statement-breakpoint
ALTER TABLE "animal" ADD COLUMN "expected_calving_at" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX "pregnancy_check_completion_uidx" ON "pregnancy_check" ("completion_id");--> statement-breakpoint
CREATE INDEX "pregnancy_check_animal_idx" ON "pregnancy_check" ("animal_id","checked_at");--> statement-breakpoint
ALTER TABLE "pregnancy_check" ADD CONSTRAINT "pregnancy_check_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pregnancy_check" ADD CONSTRAINT "pregnancy_check_animal_id_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animal"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pregnancy_check" ADD CONSTRAINT "pregnancy_check_completion_id_step_completion_id_fkey" FOREIGN KEY ("completion_id") REFERENCES "step_completion"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pregnancy_check" ADD CONSTRAINT "pregnancy_check_service_id_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service"("id");--> statement-breakpoint
ALTER TABLE "pregnancy_check" ADD CONSTRAINT "pregnancy_check_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");