CREATE TABLE "feed_purchase_order" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"feed_item_id" text NOT NULL,
	"counterparty_id" text NOT NULL,
	"assigned_to" text NOT NULL,
	"quantity" numeric(12,1) NOT NULL,
	"unit_price_money" numeric(12,2) NOT NULL,
	"budget_money" numeric(12,2) NOT NULL,
	"needed_on" text NOT NULL,
	"lead_days" integer NOT NULL,
	"buffer_days" integer NOT NULL,
	"forecast" jsonb,
	"note" text,
	"state" text DEFAULT 'requested' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"requested_by" text NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"ordered_by" text,
	"ordered_at" timestamp with time zone,
	"order_reference" text,
	"delivery_due_on" text,
	"ended_by" text,
	"ended_at" timestamp with time zone,
	"end_reason" text
);
--> statement-breakpoint
ALTER TABLE "feed_in" ADD COLUMN "purchase_order_id" text;--> statement-breakpoint
CREATE INDEX "feed_purchase_order_farm_idx" ON "feed_purchase_order" ("farm_id","state","needed_on");--> statement-breakpoint
CREATE INDEX "feed_purchase_order_item_idx" ON "feed_purchase_order" ("farm_id","feed_item_id");--> statement-breakpoint
ALTER TABLE "feed_in" ADD CONSTRAINT "feed_in_purchase_order_id_feed_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "feed_purchase_order"("id");--> statement-breakpoint
ALTER TABLE "feed_purchase_order" ADD CONSTRAINT "feed_purchase_order_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "feed_purchase_order" ADD CONSTRAINT "feed_purchase_order_feed_item_id_feed_item_id_fkey" FOREIGN KEY ("feed_item_id") REFERENCES "feed_item"("id");--> statement-breakpoint
ALTER TABLE "feed_purchase_order" ADD CONSTRAINT "feed_purchase_order_counterparty_id_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparty"("id");--> statement-breakpoint
ALTER TABLE "feed_purchase_order" ADD CONSTRAINT "feed_purchase_order_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "feed_purchase_order" ADD CONSTRAINT "feed_purchase_order_requested_by_user_id_fkey" FOREIGN KEY ("requested_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "feed_purchase_order" ADD CONSTRAINT "feed_purchase_order_approved_by_user_id_fkey" FOREIGN KEY ("approved_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "feed_purchase_order" ADD CONSTRAINT "feed_purchase_order_ordered_by_user_id_fkey" FOREIGN KEY ("ordered_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "feed_purchase_order" ADD CONSTRAINT "feed_purchase_order_ended_by_user_id_fkey" FOREIGN KEY ("ended_by") REFERENCES "user"("id");