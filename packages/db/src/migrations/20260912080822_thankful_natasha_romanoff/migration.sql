ALTER TABLE "animal" ADD COLUMN "meat_withdrawal_until" timestamp;--> statement-breakpoint
ALTER TABLE "animal" ADD COLUMN "withdrawal_shortened_at" timestamp;--> statement-breakpoint
ALTER TABLE "animal" ADD COLUMN "withdrawal_shortened_by" text;--> statement-breakpoint
ALTER TABLE "animal" ADD COLUMN "withdrawal_shortened_reason" text;--> statement-breakpoint
ALTER TABLE "animal" ADD CONSTRAINT "animal_withdrawal_shortened_by_user_id_fkey" FOREIGN KEY ("withdrawal_shortened_by") REFERENCES "user"("id");