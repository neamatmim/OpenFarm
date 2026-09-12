CREATE TABLE "weigh_in" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"completion_id" text NOT NULL,
	"weight_kg" numeric(7,2) NOT NULL,
	"method" text DEFAULT 'scale' NOT NULL,
	"flagged_note" text,
	"weighed_at" timestamp NOT NULL,
	"recorded_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "weigh_in_completion_uidx" ON "weigh_in" ("completion_id");--> statement-breakpoint
CREATE INDEX "weigh_in_animal_idx" ON "weigh_in" ("animal_id","weighed_at");--> statement-breakpoint
ALTER TABLE "weigh_in" ADD CONSTRAINT "weigh_in_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "weigh_in" ADD CONSTRAINT "weigh_in_animal_id_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animal"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "weigh_in" ADD CONSTRAINT "weigh_in_completion_id_step_completion_id_fkey" FOREIGN KEY ("completion_id") REFERENCES "step_completion"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "weigh_in" ADD CONSTRAINT "weigh_in_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");