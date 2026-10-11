CREATE TABLE "animal_feed_plan" (
	"id" text PRIMARY KEY,
	"revision" integer NOT NULL,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"supersedes_id" text,
	"snapshot" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "animal_feed_plan_revision_uidx" ON "animal_feed_plan" ("animal_id","revision");--> statement-breakpoint
CREATE INDEX "animal_feed_plan_animal_idx" ON "animal_feed_plan" ("farm_id","animal_id","created_at");--> statement-breakpoint
ALTER TABLE "animal_feed_plan" ADD CONSTRAINT "animal_feed_plan_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "animal_feed_plan" ADD CONSTRAINT "animal_feed_plan_animal_id_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animal"("id");--> statement-breakpoint
ALTER TABLE "animal_feed_plan" ADD CONSTRAINT "animal_feed_plan_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id");--> statement-breakpoint
CREATE TRIGGER "animal_feed_plan_kept" BEFORE UPDATE OR DELETE ON "animal_feed_plan"
  FOR EACH ROW EXECUTE FUNCTION "kept_as_written"();--> statement-breakpoint
CREATE TRIGGER "animal_feed_plan_not_emptied" BEFORE TRUNCATE ON "animal_feed_plan"
  FOR EACH STATEMENT EXECUTE FUNCTION "kept_as_written"();
