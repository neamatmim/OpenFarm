CREATE TABLE "mortality" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"kind" text NOT NULL,
	"happened_at" timestamp NOT NULL,
	"cause" text NOT NULL,
	"disposal" text NOT NULL,
	"disposal_note" text,
	"recorded_by" text,
	"recorded_by_role" text,
	"recorded_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "mortality_animal_uidx" ON "mortality" ("animal_id");--> statement-breakpoint
CREATE INDEX "mortality_farm_idx" ON "mortality" ("farm_id","happened_at");--> statement-breakpoint
ALTER TABLE "mortality" ADD CONSTRAINT "mortality_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "mortality" ADD CONSTRAINT "mortality_animal_id_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animal"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "mortality" ADD CONSTRAINT "mortality_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");