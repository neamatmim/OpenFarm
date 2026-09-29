CREATE TABLE "baki_payment" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"counterparty_id" text NOT NULL,
	"kind" text NOT NULL,
	"amount_bdt" numeric(12,2) NOT NULL,
	"paid_on" text NOT NULL,
	"note" text,
	"recorded_by" text,
	"recorded_by_role" text NOT NULL,
	"recorded_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "baki_payment_buyer_idx" ON "baki_payment" ("farm_id","counterparty_id","kind");--> statement-breakpoint
ALTER TABLE "baki_payment" ADD CONSTRAINT "baki_payment_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "baki_payment" ADD CONSTRAINT "baki_payment_counterparty_id_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparty"("id");--> statement-breakpoint
ALTER TABLE "baki_payment" ADD CONSTRAINT "baki_payment_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");