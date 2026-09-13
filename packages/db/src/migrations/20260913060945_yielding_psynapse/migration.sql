CREATE TABLE "feed_in" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"feed_item_id" text NOT NULL,
	"kind" text NOT NULL,
	"quantity" numeric(12,1) NOT NULL,
	"price_bdt" numeric(12,2),
	"counterparty_id" text,
	"received_on" timestamp NOT NULL,
	"recorded_by" text,
	"recorded_by_role" text NOT NULL,
	"recorded_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "feed_in_item_idx" ON "feed_in" ("farm_id","feed_item_id","received_on");--> statement-breakpoint
ALTER TABLE "feed_in" ADD CONSTRAINT "feed_in_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "feed_in" ADD CONSTRAINT "feed_in_feed_item_id_feed_item_id_fkey" FOREIGN KEY ("feed_item_id") REFERENCES "feed_item"("id");--> statement-breakpoint
ALTER TABLE "feed_in" ADD CONSTRAINT "feed_in_counterparty_id_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparty"("id");--> statement-breakpoint
ALTER TABLE "feed_in" ADD CONSTRAINT "feed_in_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");