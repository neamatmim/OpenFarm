CREATE TABLE "missing" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"pen_id" text NOT NULL,
	"completion_id" text,
	"since" timestamp NOT NULL,
	"recorded_at" timestamp NOT NULL,
	"found_at" timestamp,
	"found_by" text
);
--> statement-breakpoint
CREATE INDEX "missing_farm_idx" ON "missing" ("farm_id","since");--> statement-breakpoint
CREATE UNIQUE INDEX "missing_open_uidx" ON "missing" ("animal_id") WHERE "found_at" is null;--> statement-breakpoint
CREATE INDEX "missing_completion_idx" ON "missing" ("completion_id");--> statement-breakpoint
ALTER TABLE "missing" ADD CONSTRAINT "missing_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "missing" ADD CONSTRAINT "missing_animal_id_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animal"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "missing" ADD CONSTRAINT "missing_pen_id_pen_id_fkey" FOREIGN KEY ("pen_id") REFERENCES "pen"("id");--> statement-breakpoint
ALTER TABLE "missing" ADD CONSTRAINT "missing_completion_id_step_completion_id_fkey" FOREIGN KEY ("completion_id") REFERENCES "step_completion"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "missing" ADD CONSTRAINT "missing_found_by_user_id_fkey" FOREIGN KEY ("found_by") REFERENCES "user"("id");