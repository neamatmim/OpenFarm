ALTER TABLE "venture_movement" ADD COLUMN "sale_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "venture_movement_sale_uidx" ON "venture_movement" ("sale_id");