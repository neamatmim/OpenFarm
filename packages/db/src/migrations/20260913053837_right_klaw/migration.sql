CREATE TABLE "abortion" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"aborted_at" timestamp NOT NULL,
	"stage_months" integer NOT NULL,
	"note" text NOT NULL,
	"service_id" text,
	"expected_calving_at" timestamp NOT NULL,
	"recorded_by" text,
	"recorded_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repeat_breeder_answer" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"decision" text NOT NULL,
	"note" text NOT NULL,
	"failed_attempts" integer NOT NULL,
	"answered_by" text,
	"answered_by_role" text NOT NULL,
	"answered_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "repeat_breeder_threshold" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
CREATE INDEX "abortion_animal_idx" ON "abortion" ("animal_id","aborted_at");--> statement-breakpoint
CREATE INDEX "repeat_breeder_answer_animal_idx" ON "repeat_breeder_answer" ("animal_id","answered_at");--> statement-breakpoint
ALTER TABLE "abortion" ADD CONSTRAINT "abortion_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "abortion" ADD CONSTRAINT "abortion_animal_id_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animal"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "abortion" ADD CONSTRAINT "abortion_service_id_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service"("id");--> statement-breakpoint
ALTER TABLE "abortion" ADD CONSTRAINT "abortion_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "repeat_breeder_answer" ADD CONSTRAINT "repeat_breeder_answer_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "repeat_breeder_answer" ADD CONSTRAINT "repeat_breeder_answer_animal_id_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animal"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "repeat_breeder_answer" ADD CONSTRAINT "repeat_breeder_answer_answered_by_user_id_fkey" FOREIGN KEY ("answered_by") REFERENCES "user"("id");