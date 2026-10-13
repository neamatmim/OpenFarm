CREATE TABLE "closed_month" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"month" text NOT NULL,
	"closed_by" text,
	"closed_at" timestamp with time zone NOT NULL,
	"reopened_by" text,
	"reopened_at" timestamp with time zone,
	"reopen_reason" text,
	CONSTRAINT "closed_month_month" CHECK ("month" ~ '^[0-9]{4}-[0-9]{2}$')
);
--> statement-breakpoint
CREATE TABLE "closed_month_change" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"month" text NOT NULL,
	"record_id" text NOT NULL,
	"source" text NOT NULL,
	"about" text,
	"tag_number" text,
	"change" text NOT NULL,
	"before_money" numeric(12,2),
	"after_money" numeric(12,2),
	"changed_by" text,
	"changed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "closed_month_change_month" CHECK ("month" ~ '^[0-9]{4}-[0-9]{2}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "closed_month_uidx" ON "closed_month" ("farm_id","month");--> statement-breakpoint
CREATE INDEX "closed_month_change_at_idx" ON "closed_month_change" ("farm_id","changed_at");--> statement-breakpoint
ALTER TABLE "closed_month" ADD CONSTRAINT "closed_month_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "closed_month" ADD CONSTRAINT "closed_month_closed_by_user_id_fkey" FOREIGN KEY ("closed_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "closed_month" ADD CONSTRAINT "closed_month_reopened_by_user_id_fkey" FOREIGN KEY ("reopened_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "closed_month_change" ADD CONSTRAINT "closed_month_change_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "closed_month_change" ADD CONSTRAINT "closed_month_change_changed_by_user_id_fkey" FOREIGN KEY ("changed_by") REFERENCES "user"("id");;--> statement-breakpoint
ALTER TABLE "closed_month_change" ADD CONSTRAINT "closed_month_change_source_known" CHECK ("source" IN ('dispatch', 'intake', 'buying_trip', 'selling_trip', 'sale', 'sale_broker', 'wage_draw', 'feed_in', 'medicine_purchase', 'vet_fee', 'internal_sale_in', 'internal_sale_out', 'reimbursement', 'settlement_adjustment', 'farm_share', 'farm_loss', 'venture_made_good', 'venture_capital_out', 'venture_capital_back', 'venture_capital_return', 'receivable_payment', 'supplier_payment', 'by_hand', 'handover', 'receivable_write_off', 'cash_count', 'bank_check'));--> statement-breakpoint
ALTER TABLE "closed_month_change" ADD CONSTRAINT "closed_month_change_change_known" CHECK ("change" IN ('entered', 'corrected', 'moved', 'voided'));