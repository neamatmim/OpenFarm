ALTER TABLE "invite" ADD COLUMN "for_user_id" text;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_for_user_id_user_id_fkey" FOREIGN KEY ("for_user_id") REFERENCES "user"("id");