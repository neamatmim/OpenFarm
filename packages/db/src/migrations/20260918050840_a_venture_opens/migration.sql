CREATE TABLE "venture" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"name" text NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"target_capital_bdt" numeric(12,2) NOT NULL,
	"floor_bdt" numeric(12,2) NOT NULL,
	"decide_by" text NOT NULL,
	"target_window_start" text NOT NULL,
	"target_window_end" text NOT NULL,
	"unit_price_bdt" numeric(12,2) NOT NULL,
	"units" integer NOT NULL,
	"cattle_budget_bdt" numeric(12,2) NOT NULL,
	"cancelled_reason" text,
	"opened_by" text,
	"opened_by_role" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "venture_floor_percent" integer DEFAULT 70 NOT NULL;--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "venture_running_percent" integer DEFAULT 25 NOT NULL;--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "wind_up_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
CREATE INDEX "venture_state_idx" ON "venture" ("farm_id","state");--> statement-breakpoint
ALTER TABLE "venture" ADD CONSTRAINT "venture_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "venture" ADD CONSTRAINT "venture_opened_by_user_id_fkey" FOREIGN KEY ("opened_by") REFERENCES "user"("id");