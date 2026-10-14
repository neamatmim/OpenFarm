-- Feed made on the farm (ADR 0031): a Feed Making takes its inputs out of the store and brings its made feed in as a
-- Feed In of the new kind `made`, worth what went into it.
CREATE TABLE "feed_making" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"output_feed_item_id" text NOT NULL,
	"made_at" timestamp with time zone NOT NULL,
	"ready_on" text,
	"note" text,
	"recorded_by" text,
	"recorded_by_role" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_making_input" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"feed_making_id" text NOT NULL,
	"feed_item_id" text NOT NULL,
	"quantity" numeric(12,1) NOT NULL,
	CONSTRAINT "feed_making_input_quantity_not_negative" CHECK ("quantity" >= 0)
);
--> statement-breakpoint
ALTER TABLE "feed_in" ADD COLUMN "feed_making_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "feed_in_making_uidx" ON "feed_in" ("feed_making_id");--> statement-breakpoint
CREATE INDEX "feed_making_farm_idx" ON "feed_making" ("farm_id","made_at");--> statement-breakpoint
CREATE INDEX "feed_making_output_idx" ON "feed_making" ("farm_id","output_feed_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "feed_making_input_item_uidx" ON "feed_making_input" ("feed_making_id","feed_item_id");--> statement-breakpoint
CREATE INDEX "feed_making_input_item_idx" ON "feed_making_input" ("farm_id","feed_item_id");--> statement-breakpoint
ALTER TABLE "feed_in" ADD CONSTRAINT "feed_in_feed_making_id_feed_making_id_fkey" FOREIGN KEY ("feed_making_id") REFERENCES "feed_making"("id");--> statement-breakpoint
ALTER TABLE "feed_making" ADD CONSTRAINT "feed_making_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "feed_making" ADD CONSTRAINT "feed_making_output_feed_item_id_feed_item_id_fkey" FOREIGN KEY ("output_feed_item_id") REFERENCES "feed_item"("id");--> statement-breakpoint
ALTER TABLE "feed_making" ADD CONSTRAINT "feed_making_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "feed_making_input" ADD CONSTRAINT "feed_making_input_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "feed_making_input" ADD CONSTRAINT "feed_making_input_feed_making_id_feed_making_id_fkey" FOREIGN KEY ("feed_making_id") REFERENCES "feed_making"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "feed_making_input" ADD CONSTRAINT "feed_making_input_feed_item_id_feed_item_id_fkey" FOREIGN KEY ("feed_item_id") REFERENCES "feed_item"("id");--> statement-breakpoint
ALTER TABLE "feed_in" ADD CONSTRAINT "feed_in_made_by_a_making" CHECK (("kind" = 'made') = ("feed_making_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "feed_in" DROP CONSTRAINT "feed_in_kind_known";--> statement-breakpoint
ALTER TABLE "feed_in" ADD CONSTRAINT "feed_in_kind_known" CHECK ("kind" IN ('purchase', 'harvest', 'made'));--> statement-breakpoint
ALTER TABLE "feed_making" ADD CONSTRAINT "feed_making_recorded_by_role_known" CHECK ("recorded_by_role" IN ('owner', 'manager', 'staff', 'vet'));