CREATE TABLE "supplier_invoice" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"counterparty_id" text NOT NULL,
	"number" text NOT NULL,
	"invoiced_on" text NOT NULL,
	"due_on" text NOT NULL,
	"recorded_by" text,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "supplier_invoice_days_check" CHECK ("due_on" >= "invoiced_on")
);
--> statement-breakpoint
CREATE TABLE "supplier_invoice_photo" (
	"invoice_id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"content_type" text NOT NULL,
	"data" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_payment" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"amount_money" numeric(12,2) NOT NULL,
	"paid_on" text NOT NULL,
	"payment_method" text NOT NULL,
	"note" text,
	"recorded_by" text,
	"recorded_by_role" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "supplier_payment_amount_check" CHECK ("amount_money" > 0)
);
--> statement-breakpoint
CREATE TABLE "supplier_profile" (
	"counterparty_id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"contact_person" text,
	"credit_days" integer DEFAULT 0 NOT NULL,
	"note" text,
	"version" integer DEFAULT 1 NOT NULL,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "supplier_credit_days_check" CHECK ("credit_days" BETWEEN 0 AND 365)
);
--> statement-breakpoint
ALTER TABLE "feed_in" ADD COLUMN "supplier_invoice_id" text;--> statement-breakpoint
ALTER TABLE "feed_in" ADD COLUMN "paid_at_delivery_money" numeric(12,2);--> statement-breakpoint
ALTER TABLE "feed_purchase_order" ADD COLUMN "credit_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "feed_in_invoice_idx" ON "feed_in" ("farm_id","supplier_invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_invoice_number_uidx" ON "supplier_invoice" ("farm_id","counterparty_id",lower("number"));--> statement-breakpoint
CREATE INDEX "supplier_payment_invoice_idx" ON "supplier_payment" ("farm_id","invoice_id");--> statement-breakpoint
CREATE INDEX "supplier_profile_farm_idx" ON "supplier_profile" ("farm_id");--> statement-breakpoint
ALTER TABLE "feed_in" ADD CONSTRAINT "feed_in_supplier_invoice_id_supplier_invoice_id_fkey" FOREIGN KEY ("supplier_invoice_id") REFERENCES "supplier_invoice"("id");--> statement-breakpoint
ALTER TABLE "supplier_invoice" ADD CONSTRAINT "supplier_invoice_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "supplier_invoice" ADD CONSTRAINT "supplier_invoice_counterparty_id_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparty"("id");--> statement-breakpoint
ALTER TABLE "supplier_invoice" ADD CONSTRAINT "supplier_invoice_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "supplier_invoice_photo" ADD CONSTRAINT "supplier_invoice_photo_invoice_id_supplier_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "supplier_invoice"("id");--> statement-breakpoint
ALTER TABLE "supplier_invoice_photo" ADD CONSTRAINT "supplier_invoice_photo_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "supplier_payment" ADD CONSTRAINT "supplier_payment_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "supplier_payment" ADD CONSTRAINT "supplier_payment_invoice_id_supplier_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "supplier_invoice"("id");--> statement-breakpoint
ALTER TABLE "supplier_payment" ADD CONSTRAINT "supplier_payment_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "supplier_profile" ADD CONSTRAINT "supplier_profile_counterparty_id_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparty"("id");--> statement-breakpoint
ALTER TABLE "supplier_profile" ADD CONSTRAINT "supplier_profile_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "feed_in" ADD CONSTRAINT "feed_in_payment_check" CHECK (("supplier_invoice_id" IS NULL AND "paid_at_delivery_money" IS NULL) OR ("supplier_invoice_id" IS NOT NULL AND "kind" = 'purchase' AND "paid_at_delivery_money" >= 0 AND "paid_at_delivery_money" <= "price_money"));
--> statement-breakpoint
-- Keep historical supplier identities and payment history. No invoices or cash entries are invented.
INSERT INTO "supplier_profile" ("counterparty_id", "farm_id", "created_at")
SELECT DISTINCT c."id", c."farm_id", c."created_at" FROM "counterparty" c
WHERE EXISTS (SELECT 1 FROM "feed_in" f WHERE f."counterparty_id" = c."id" AND f."farm_id" = c."farm_id" AND f."kind" = 'purchase')
OR EXISTS (SELECT 1 FROM "feed_purchase_order" p WHERE p."counterparty_id" = c."id" AND p."farm_id" = c."farm_id")
ON CONFLICT DO NOTHING;

--> statement-breakpoint
-- This constraint predates schema-managed checks. Extend it for actual supplier payments.
ALTER TABLE "money_event" DROP CONSTRAINT "money_event_source_known";
--> statement-breakpoint
ALTER TABLE "money_event" ADD CONSTRAINT "money_event_source_known" CHECK ("source" IN ('dispatch', 'intake', 'buying_trip', 'selling_trip', 'sale', 'sale_broker', 'wage_draw', 'feed_in', 'medicine_purchase', 'vet_fee', 'internal_sale_in', 'internal_sale_out', 'reimbursement', 'settlement_adjustment', 'farm_share', 'farm_loss', 'venture_made_good', 'venture_capital_out', 'venture_capital_back', 'venture_capital_return', 'receivable_payment', 'supplier_payment', 'by_hand'));
