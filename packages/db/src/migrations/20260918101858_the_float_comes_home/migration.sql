ALTER TABLE "venture_movement" ADD COLUMN "reconciled_at" timestamp;--> statement-breakpoint
ALTER TABLE "venture_movement" ADD COLUMN "reconciled_by" text;--> statement-breakpoint
ALTER TABLE "venture_movement" ADD CONSTRAINT "venture_movement_reconciled_by_user_id_fkey" FOREIGN KEY ("reconciled_by") REFERENCES "user"("id");