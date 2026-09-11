CREATE TABLE "observation" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"completion_id" text NOT NULL,
	"saw" text NOT NULL,
	"saw_label" text NOT NULL,
	"seen_by" text,
	"seen_at" timestamp NOT NULL,
	"withdrawn_at" timestamp,
	"superseded_by_id" text,
	"recorded_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "observation_animal_idx" ON "observation" ("animal_id","seen_at");--> statement-breakpoint
CREATE INDEX "observation_farm_idx" ON "observation" ("farm_id","seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "observation_completion_uidx" ON "observation" ("completion_id") WHERE "withdrawn_at" is null;--> statement-breakpoint
ALTER TABLE "observation" ADD CONSTRAINT "observation_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "observation" ADD CONSTRAINT "observation_animal_id_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animal"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "observation" ADD CONSTRAINT "observation_completion_id_step_completion_id_fkey" FOREIGN KEY ("completion_id") REFERENCES "step_completion"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "observation" ADD CONSTRAINT "observation_seen_by_user_id_fkey" FOREIGN KEY ("seen_by") REFERENCES "user"("id");