CREATE TABLE "animal" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"tag_number" text NOT NULL,
	"official_tag" text,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"sex" text NOT NULL,
	"side" text NOT NULL,
	"state" text NOT NULL,
	"pen_id" text NOT NULL,
	"source" text NOT NULL,
	"breed" text,
	"birth_date" timestamp,
	"photo_updated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "animal_move" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"from_pen_id" text,
	"to_pen_id" text NOT NULL,
	"from_side" text,
	"to_side" text NOT NULL,
	"reason" text,
	"moved_by" text,
	"moved_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "animal_photo" (
	"animal_id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"content_type" text NOT NULL,
	"data" text NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pen" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"shed_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retag" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"reason" text NOT NULL,
	"retagged_by" text,
	"retagged_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shed" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tag_sequence" (
	"farm_id" text NOT NULL,
	"prefix" text NOT NULL,
	"next" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "animal_tag_uidx" ON "animal" ("farm_id","tag_number");--> statement-breakpoint
CREATE INDEX "animal_pen_idx" ON "animal" ("farm_id","pen_id");--> statement-breakpoint
CREATE INDEX "animal_side_state_idx" ON "animal" ("farm_id","side","state");--> statement-breakpoint
CREATE INDEX "animal_move_animal_idx" ON "animal_move" ("animal_id","moved_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pen_name_uidx" ON "pen" ("shed_id","name");--> statement-breakpoint
CREATE INDEX "retag_animal_idx" ON "retag" ("animal_id","retagged_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shed_name_uidx" ON "shed" ("farm_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "tag_sequence_uidx" ON "tag_sequence" ("farm_id","prefix");--> statement-breakpoint
ALTER TABLE "animal" ADD CONSTRAINT "animal_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "animal" ADD CONSTRAINT "animal_pen_id_pen_id_fkey" FOREIGN KEY ("pen_id") REFERENCES "pen"("id");--> statement-breakpoint
ALTER TABLE "animal_move" ADD CONSTRAINT "animal_move_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "animal_move" ADD CONSTRAINT "animal_move_animal_id_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animal"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "animal_move" ADD CONSTRAINT "animal_move_from_pen_id_pen_id_fkey" FOREIGN KEY ("from_pen_id") REFERENCES "pen"("id");--> statement-breakpoint
ALTER TABLE "animal_move" ADD CONSTRAINT "animal_move_to_pen_id_pen_id_fkey" FOREIGN KEY ("to_pen_id") REFERENCES "pen"("id");--> statement-breakpoint
ALTER TABLE "animal_move" ADD CONSTRAINT "animal_move_moved_by_user_id_fkey" FOREIGN KEY ("moved_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "animal_photo" ADD CONSTRAINT "animal_photo_animal_id_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animal"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "animal_photo" ADD CONSTRAINT "animal_photo_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pen" ADD CONSTRAINT "pen_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pen" ADD CONSTRAINT "pen_shed_id_shed_id_fkey" FOREIGN KEY ("shed_id") REFERENCES "shed"("id") ON DELETE CASCADE;--> statement-breakpoint
-- Pen Assignments made before Pens existed hold placeholder ids that cannot map to a real
-- Pen, so they are cleared before the foreign key is added; the Manager re-assigns Staff
-- to Pens once the herd register is in.
DELETE FROM "pen_assignment";--> statement-breakpoint
ALTER TABLE "pen_assignment" ADD CONSTRAINT "pen_assignment_pen_id_pen_id_fkey" FOREIGN KEY ("pen_id") REFERENCES "pen"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "retag" ADD CONSTRAINT "retag_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "retag" ADD CONSTRAINT "retag_animal_id_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animal"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "retag" ADD CONSTRAINT "retag_retagged_by_user_id_fkey" FOREIGN KEY ("retagged_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "shed" ADD CONSTRAINT "shed_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tag_sequence" ADD CONSTRAINT "tag_sequence_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;