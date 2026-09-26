CREATE TABLE "venture_projection" (
	"venture_id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"sale_low_bdt_per_kg" numeric(12,2) NOT NULL,
	"sale_high_bdt_per_kg" numeric(12,2) NOT NULL,
	"buy_bdt_per_kg" numeric(12,2),
	"buy_weight_kg" numeric(7,2),
	"daily_gain_kg" numeric(5,2),
	"set_at" timestamp NOT NULL,
	"set_by" text
);
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "investor_projections" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "venture_projection" ADD CONSTRAINT "venture_projection_venture_id_venture_id_fkey" FOREIGN KEY ("venture_id") REFERENCES "venture"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "venture_projection" ADD CONSTRAINT "venture_projection_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "venture_projection" ADD CONSTRAINT "venture_projection_set_by_user_id_fkey" FOREIGN KEY ("set_by") REFERENCES "user"("id");