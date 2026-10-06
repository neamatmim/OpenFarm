ALTER TABLE "venture_movement" ADD COLUMN "held_by" text;--> statement-breakpoint
ALTER TABLE "venture_movement" ADD COLUMN "difference_money" numeric(12,2);--> statement-breakpoint
ALTER TABLE "venture_movement" ADD COLUMN "difference_reason" text;--> statement-breakpoint
ALTER TABLE "venture_movement" ADD CONSTRAINT "venture_movement_held_by_user_id_fkey" FOREIGN KEY ("held_by") REFERENCES "user"("id");