CREATE TABLE "stock_count" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"feed_item_id" text NOT NULL,
	"completion_id" text NOT NULL,
	"counted_at" timestamp NOT NULL,
	"expected" numeric(12,1) NOT NULL,
	"counted" numeric(12,1) NOT NULL,
	"reason" text,
	"counted_by" text,
	"recorded_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feed_item" ADD COLUMN "low_stock_at" numeric(12,1);--> statement-breakpoint
CREATE UNIQUE INDEX "stock_count_line_uidx" ON "stock_count" ("completion_id","feed_item_id");--> statement-breakpoint
CREATE INDEX "stock_count_item_idx" ON "stock_count" ("farm_id","feed_item_id","counted_at");--> statement-breakpoint
ALTER TABLE "stock_count" ADD CONSTRAINT "stock_count_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "stock_count" ADD CONSTRAINT "stock_count_feed_item_id_feed_item_id_fkey" FOREIGN KEY ("feed_item_id") REFERENCES "feed_item"("id");--> statement-breakpoint
ALTER TABLE "stock_count" ADD CONSTRAINT "stock_count_counted_by_user_id_fkey" FOREIGN KEY ("counted_by") REFERENCES "user"("id");