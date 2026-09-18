CREATE TABLE "internal_sale" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"from_venture_id" text,
	"to_venture_id" text,
	"weight_kg" numeric(7,2) NOT NULL,
	"weigh_in_id" text,
	"rate_bdt_per_kg" numeric(10,2) NOT NULL,
	"price_bdt" numeric(12,2) NOT NULL,
	"note" text NOT NULL,
	"sold_on" text NOT NULL,
	"recorded_by" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "venture_movement" ADD COLUMN "internal_sale_id" text;--> statement-breakpoint
CREATE INDEX "internal_sale_idx" ON "internal_sale" ("farm_id","animal_id");--> statement-breakpoint
ALTER TABLE "internal_sale" ADD CONSTRAINT "internal_sale_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "internal_sale" ADD CONSTRAINT "internal_sale_animal_id_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animal"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "internal_sale" ADD CONSTRAINT "internal_sale_from_venture_id_venture_id_fkey" FOREIGN KEY ("from_venture_id") REFERENCES "venture"("id");--> statement-breakpoint
ALTER TABLE "internal_sale" ADD CONSTRAINT "internal_sale_to_venture_id_venture_id_fkey" FOREIGN KEY ("to_venture_id") REFERENCES "venture"("id");--> statement-breakpoint
ALTER TABLE "internal_sale" ADD CONSTRAINT "internal_sale_weigh_in_id_weigh_in_id_fkey" FOREIGN KEY ("weigh_in_id") REFERENCES "weigh_in"("id");--> statement-breakpoint
ALTER TABLE "internal_sale" ADD CONSTRAINT "internal_sale_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");