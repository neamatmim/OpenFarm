ALTER TABLE "handover" ADD COLUMN "venture_id" text;--> statement-breakpoint
ALTER TABLE "venture_movement" ADD COLUMN "handover_id" text;--> statement-breakpoint
ALTER TABLE "handover" ADD CONSTRAINT "handover_venture_id_venture_id_fkey" FOREIGN KEY ("venture_id") REFERENCES "venture"("id");