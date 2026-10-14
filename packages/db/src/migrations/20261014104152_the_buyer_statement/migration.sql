CREATE TABLE "buyer_statement" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"counterparty_id" text NOT NULL,
	"number" text,
	"from_day" text NOT NULL,
	"to_day" text NOT NULL,
	"stated_on" text NOT NULL,
	"pay_by" text NOT NULL,
	"liters" numeric(10,2) NOT NULL,
	"amount_money" numeric(12,2) NOT NULL,
	"fat_percent" numeric(4,2),
	"snf_percent" numeric(4,2),
	"rate_per_liter_money" numeric(8,2),
	"note" text,
	"recorded_by" text,
	"recorded_by_role" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"voided_by" text,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	CONSTRAINT "buyer_statement_days" CHECK ("to_day" >= "from_day"),
	CONSTRAINT "buyer_statement_liters_not_negative" CHECK ("liters" >= 0),
	CONSTRAINT "buyer_statement_rate_per_liter_money_not_negative" CHECK ("rate_per_liter_money" >= 0),
	CONSTRAINT "buyer_statement_amount_money_not_negative" CHECK ("amount_money" >= 0),
	CONSTRAINT "buyer_statement_recorded_by_role_known" CHECK ("recorded_by_role" IN ('owner', 'manager', 'staff', 'vet'))
);
--> statement-breakpoint
CREATE TABLE "buyer_statement_photo" (
	"statement_id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"content_type" text NOT NULL,
	"data" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dispatch" ADD COLUMN "buyer_statement_id" text;--> statement-breakpoint
ALTER TABLE "dispatch" ALTER COLUMN "price_per_liter_money" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "buyer_statement_buyer_idx" ON "buyer_statement" ("farm_id","counterparty_id","from_day");--> statement-breakpoint
CREATE UNIQUE INDEX "buyer_statement_number_uidx" ON "buyer_statement" ("farm_id","counterparty_id",lower("number")) WHERE "voided_at" is null and "number" is not null;--> statement-breakpoint
CREATE INDEX "dispatch_buyer_statement_idx" ON "dispatch" ("buyer_statement_id");--> statement-breakpoint
ALTER TABLE "buyer_statement" ADD CONSTRAINT "buyer_statement_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "buyer_statement" ADD CONSTRAINT "buyer_statement_counterparty_id_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparty"("id");--> statement-breakpoint
ALTER TABLE "buyer_statement" ADD CONSTRAINT "buyer_statement_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "buyer_statement" ADD CONSTRAINT "buyer_statement_voided_by_user_id_fkey" FOREIGN KEY ("voided_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "buyer_statement_photo" ADD CONSTRAINT "buyer_statement_photo_statement_id_buyer_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "buyer_statement"("id");--> statement-breakpoint
ALTER TABLE "buyer_statement_photo" ADD CONSTRAINT "buyer_statement_photo_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "dispatch" ADD CONSTRAINT "dispatch_buyer_statement_id_buyer_statement_id_fkey" FOREIGN KEY ("buyer_statement_id") REFERENCES "buyer_statement"("id");--> statement-breakpoint
ALTER TABLE "dispatch" ADD CONSTRAINT "dispatch_priced_once" CHECK ("buyer_statement_id" is null or "price_per_liter_money" is null);--> statement-breakpoint
ALTER TABLE "dispatch" ADD CONSTRAINT "dispatch_to_follow_owes_nothing" CHECK ("price_per_liter_money" is not null or "buyer_statement_id" is not null or "receivable_money" = 0);--> statement-breakpoint
-- A Buyer Statement pricing milk sent in a closed month is a change the Owner makes to it, listed like the rest (ADR 0030).
ALTER TABLE "closed_month_change" DROP CONSTRAINT "closed_month_change_source_known";--> statement-breakpoint
ALTER TABLE "closed_month_change" ADD CONSTRAINT "closed_month_change_source_known" CHECK ("source" IN ('dispatch', 'intake', 'buying_trip', 'selling_trip', 'sale', 'sale_broker', 'wage_draw', 'feed_in', 'medicine_purchase', 'vet_fee', 'internal_sale_in', 'internal_sale_out', 'reimbursement', 'settlement_adjustment', 'farm_share', 'farm_loss', 'venture_made_good', 'venture_capital_out', 'venture_capital_back', 'venture_capital_return', 'receivable_payment', 'supplier_payment', 'by_hand', 'handover', 'receivable_write_off', 'cash_count', 'bank_check', 'buyer_statement'));
