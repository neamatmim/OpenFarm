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
CREATE TABLE "feeding" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"instance_id" text NOT NULL,
	"completion_id" text NOT NULL,
	"pen_id" text NOT NULL,
	"ration_version_id" text NOT NULL,
	"animals" integer NOT NULL,
	"sessions_per_day" integer NOT NULL,
	"lines" jsonb NOT NULL,
	"shortfall_percent" integer DEFAULT 0 NOT NULL,
	"flagged_at" timestamp,
	"fed_by" text,
	"fed_at" timestamp NOT NULL,
	"recorded_at" timestamp NOT NULL
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
	"items" jsonb NOT NULL,
	"note" text,
	"published_by" text,
	"published_by_role" text,
	"published_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "feed_tolerance_percent" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "feed_item_name_uidx" ON "feed_item" ("farm_id","name_bn");--> statement-breakpoint
CREATE INDEX "feeding_pen_idx" ON "feeding" ("farm_id","pen_id","fed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "feeding_completion_uidx" ON "feeding" ("completion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ration_name_uidx" ON "ration" ("farm_id","name_bn");--> statement-breakpoint
CREATE UNIQUE INDEX "ration_version_number_uidx" ON "ration_version" ("ration_id","number");--> statement-breakpoint
CREATE INDEX "ration_version_at_idx" ON "ration_version" ("ration_id","published_at");--> statement-breakpoint
ALTER TABLE "feed_item" ADD CONSTRAINT "feed_item_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "feed_item" ADD CONSTRAINT "feed_item_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "feeding" ADD CONSTRAINT "feeding_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "feeding" ADD CONSTRAINT "feeding_pen_id_pen_id_fkey" FOREIGN KEY ("pen_id") REFERENCES "pen"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "feeding" ADD CONSTRAINT "feeding_ration_version_id_ration_version_id_fkey" FOREIGN KEY ("ration_version_id") REFERENCES "ration_version"("id");--> statement-breakpoint
ALTER TABLE "feeding" ADD CONSTRAINT "feeding_fed_by_user_id_fkey" FOREIGN KEY ("fed_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "pen_ration" ADD CONSTRAINT "pen_ration_pen_id_pen_id_fkey" FOREIGN KEY ("pen_id") REFERENCES "pen"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pen_ration" ADD CONSTRAINT "pen_ration_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pen_ration" ADD CONSTRAINT "pen_ration_ration_id_ration_id_fkey" FOREIGN KEY ("ration_id") REFERENCES "ration"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pen_ration" ADD CONSTRAINT "pen_ration_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "ration" ADD CONSTRAINT "ration_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ration_version" ADD CONSTRAINT "ration_version_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ration_version" ADD CONSTRAINT "ration_version_ration_id_ration_id_fkey" FOREIGN KEY ("ration_id") REFERENCES "ration"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ration_version" ADD CONSTRAINT "ration_version_published_by_user_id_fkey" FOREIGN KEY ("published_by") REFERENCES "user"("id");