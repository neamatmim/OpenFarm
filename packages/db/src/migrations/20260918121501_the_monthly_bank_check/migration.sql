CREATE TABLE "venture_bank_check" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"venture_id" text NOT NULL,
	"for_month" text NOT NULL,
	"read_bdt" numeric(12,2) NOT NULL,
	"expected_bdt" numeric(12,2) NOT NULL,
	"note" text,
	"checked_by" text,
	"checked_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "venture_bank_check_uidx" ON "venture_bank_check" ("farm_id","venture_id","for_month");--> statement-breakpoint
ALTER TABLE "venture_bank_check" ADD CONSTRAINT "venture_bank_check_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "venture_bank_check" ADD CONSTRAINT "venture_bank_check_venture_id_venture_id_fkey" FOREIGN KEY ("venture_id") REFERENCES "venture"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "venture_bank_check" ADD CONSTRAINT "venture_bank_check_checked_by_user_id_fkey" FOREIGN KEY ("checked_by") REFERENCES "user"("id");