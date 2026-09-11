ALTER TABLE "step_completion" ADD COLUMN "animal_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Rows written before the sentinel existed carry their animal id (or "" for a pen-level
-- Step), so the new unique index sees the same identity the old one meant to.
UPDATE "step_completion" SET "animal_key" = COALESCE("animal_id", '');--> statement-breakpoint
DROP INDEX "step_completion_uidx";--> statement-breakpoint
CREATE UNIQUE INDEX "step_completion_uidx" ON "step_completion" ("instance_id","step_id","animal_key");