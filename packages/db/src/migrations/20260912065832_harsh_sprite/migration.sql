CREATE TABLE "diagnosis" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"observation_id" text,
	"condition" text NOT NULL,
	"condition_en" text,
	"note" text,
	"diagnosed_by" text NOT NULL,
	"diagnosed_at" timestamp NOT NULL,
	"recorded_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "diagnosis_animal_idx" ON "diagnosis" ("animal_id","diagnosed_at");--> statement-breakpoint
CREATE INDEX "diagnosis_farm_idx" ON "diagnosis" ("farm_id","diagnosed_at");--> statement-breakpoint
CREATE INDEX "diagnosis_observation_idx" ON "diagnosis" ("observation_id");--> statement-breakpoint
ALTER TABLE "diagnosis" ADD CONSTRAINT "diagnosis_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "diagnosis" ADD CONSTRAINT "diagnosis_animal_id_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animal"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "diagnosis" ADD CONSTRAINT "diagnosis_observation_id_observation_id_fkey" FOREIGN KEY ("observation_id") REFERENCES "observation"("id");--> statement-breakpoint
ALTER TABLE "diagnosis" ADD CONSTRAINT "diagnosis_diagnosed_by_user_id_fkey" FOREIGN KEY ("diagnosed_by") REFERENCES "user"("id");