CREATE TABLE "ready_set_aside" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"grounds" text[] NOT NULL,
	"reason" text NOT NULL,
	"set_aside_by" text,
	"set_aside_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ready_set_aside_animal_uidx" ON "ready_set_aside" ("animal_id");--> statement-breakpoint
ALTER TABLE "ready_set_aside" ADD CONSTRAINT "ready_set_aside_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ready_set_aside" ADD CONSTRAINT "ready_set_aside_animal_id_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animal"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ready_set_aside" ADD CONSTRAINT "ready_set_aside_set_aside_by_user_id_fkey" FOREIGN KEY ("set_aside_by") REFERENCES "user"("id");