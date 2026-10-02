CREATE TABLE "farm_account_check" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"farm_account_id" text NOT NULL,
	"for_month" text NOT NULL,
	"read_bdt" numeric(12,2) NOT NULL,
	"expected_bdt" numeric(12,2) NOT NULL,
	"note" text,
	"checked_by" text,
	"checked_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "farm_account_check_uidx" ON "farm_account_check" ("farm_account_id","for_month");--> statement-breakpoint
ALTER TABLE "farm_account_check" ADD CONSTRAINT "farm_account_check_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "farm_account_check" ADD CONSTRAINT "farm_account_check_farm_account_id_farm_account_id_fkey" FOREIGN KEY ("farm_account_id") REFERENCES "farm_account"("id");--> statement-breakpoint
ALTER TABLE "farm_account_check" ADD CONSTRAINT "farm_account_check_checked_by_user_id_fkey" FOREIGN KEY ("checked_by") REFERENCES "user"("id");