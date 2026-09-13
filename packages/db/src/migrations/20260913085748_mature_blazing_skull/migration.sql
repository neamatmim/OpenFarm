CREATE TABLE "money_receipt" (
	"money_event_id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"content_type" text NOT NULL,
	"data" text NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "money_category" ADD COLUMN "retired_at" timestamp;--> statement-breakpoint
ALTER TABLE "money_event" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "money_event" ADD COLUMN "wage_month" text;--> statement-breakpoint
CREATE UNIQUE INDEX "money_event_wage_uidx" ON "money_event" ("farm_id","counterparty_id","wage_month");--> statement-breakpoint
ALTER TABLE "money_receipt" ADD CONSTRAINT "money_receipt_money_event_id_money_event_id_fkey" FOREIGN KEY ("money_event_id") REFERENCES "money_event"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "money_receipt" ADD CONSTRAINT "money_receipt_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;