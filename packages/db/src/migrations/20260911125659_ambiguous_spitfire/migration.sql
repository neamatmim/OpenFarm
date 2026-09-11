ALTER TABLE "animal" ADD COLUMN "state_changed_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
-- Animals already on the farm reached their State before this column existed. Their
-- registration is the earliest honest answer, and it is the safe one: a State-triggered
-- SOP looks back a fortnight, so nobody wakes up to a check raised for the whole herd.
UPDATE "animal" SET "state_changed_at" = "created_at";--> statement-breakpoint
ALTER TABLE "sop_instance" ADD COLUMN "cause" text;--> statement-breakpoint
ALTER TABLE "sop_instance" ADD COLUMN "animal_id" text;--> statement-breakpoint
DROP INDEX "sop_instance_due_uidx";--> statement-breakpoint
CREATE UNIQUE INDEX "sop_instance_due_uidx" ON "sop_instance" ("definition_id","pen_id","due_at") WHERE "cause" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "sop_instance_cause_uidx" ON "sop_instance" ("definition_id","cause") WHERE "cause" is not null;--> statement-breakpoint
ALTER TABLE "sop_instance" ADD CONSTRAINT "sop_instance_animal_id_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animal"("id") ON DELETE CASCADE;