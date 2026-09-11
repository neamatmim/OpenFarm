CREATE TABLE "feed_item" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"name_bn" text NOT NULL,
	"name_en" text,
	"unit" text DEFAULT 'kg' NOT NULL,
	"retired_at" timestamp,
	"created_by" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pen_ration" (
	"pen_id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"ration_id" text NOT NULL,
	"assigned_by" text,
	"assigned_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ration" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"name_bn" text NOT NULL,
	"name_en" text,
	"current_version_id" text,
	"retired_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ration_version" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"ration_id" text NOT NULL,
	"number" integer NOT NULL,
	"sessions_per_day" integer NOT NULL,
	"items" jsonb NOT NULL,
	"note" text,
	"published_by" text,
	"published_by_role" text,
	"published_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "feed_item_name_uidx" ON "feed_item" ("farm_id","name_bn");--> statement-breakpoint
CREATE UNIQUE INDEX "ration_name_uidx" ON "ration" ("farm_id","name_bn");--> statement-breakpoint
CREATE UNIQUE INDEX "ration_version_number_uidx" ON "ration_version" ("ration_id","number");--> statement-breakpoint
CREATE INDEX "ration_version_at_idx" ON "ration_version" ("ration_id","published_at");--> statement-breakpoint
ALTER TABLE "feed_item" ADD CONSTRAINT "feed_item_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "feed_item" ADD CONSTRAINT "feed_item_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "pen_ration" ADD CONSTRAINT "pen_ration_pen_id_pen_id_fkey" FOREIGN KEY ("pen_id") REFERENCES "pen"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pen_ration" ADD CONSTRAINT "pen_ration_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pen_ration" ADD CONSTRAINT "pen_ration_ration_id_ration_id_fkey" FOREIGN KEY ("ration_id") REFERENCES "ration"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pen_ration" ADD CONSTRAINT "pen_ration_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "ration" ADD CONSTRAINT "ration_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ration_version" ADD CONSTRAINT "ration_version_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ration_version" ADD CONSTRAINT "ration_version_ration_id_ration_id_fkey" FOREIGN KEY ("ration_id") REFERENCES "ration"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ration_version" ADD CONSTRAINT "ration_version_published_by_user_id_fkey" FOREIGN KEY ("published_by") REFERENCES "user"("id");