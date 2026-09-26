CREATE TABLE "venture_plan" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"venture_id" text NOT NULL,
	"version" integer NOT NULL,
	"made_while" text NOT NULL,
	"sale_low_bdt_per_kg" numeric(12,2) NOT NULL,
	"sale_high_bdt_per_kg" numeric(12,2) NOT NULL,
	"reason" text,
	"made_at" timestamp NOT NULL,
	"made_by" text
);
--> statement-breakpoint
CREATE TABLE "venture_plan_line" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"position" integer NOT NULL,
	"animals" integer NOT NULL,
	"from_kg" numeric(7,2) NOT NULL,
	"to_kg" numeric(7,2) NOT NULL,
	"buy_bdt_per_kg" numeric(12,2) NOT NULL,
	"daily_gain_kg" numeric(5,2) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "venture_plan_version_uidx" ON "venture_plan" ("venture_id","version");--> statement-breakpoint
CREATE INDEX "venture_plan_line_plan_idx" ON "venture_plan_line" ("plan_id");--> statement-breakpoint
ALTER TABLE "venture_plan" ADD CONSTRAINT "venture_plan_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "venture_plan" ADD CONSTRAINT "venture_plan_venture_id_venture_id_fkey" FOREIGN KEY ("venture_id") REFERENCES "venture"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "venture_plan" ADD CONSTRAINT "venture_plan_made_by_user_id_fkey" FOREIGN KEY ("made_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "venture_plan_line" ADD CONSTRAINT "venture_plan_line_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "venture_plan_line" ADD CONSTRAINT "venture_plan_line_plan_id_venture_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "venture_plan"("id") ON DELETE CASCADE;