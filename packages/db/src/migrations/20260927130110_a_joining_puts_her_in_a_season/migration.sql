CREATE TABLE "fattening_joining" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"joined_on" text NOT NULL,
	"joined_at" timestamp NOT NULL,
	"how" text NOT NULL,
	"move_id" text,
	"internal_sale_id" text,
	"target_window_start" text NOT NULL,
	"target_window_end" text NOT NULL,
	"target_weight_kg" numeric(7,2) NOT NULL,
	"price_bdt" numeric(12,2),
	"weigh_in_id" text,
	"weight_kg" numeric(7,2),
	"rate_bdt_per_kg" numeric(10,2),
	"note" text,
	"priced_by" text,
	"priced_at" timestamp,
	"recorded_by" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "fattening_joining_animal_idx" ON "fattening_joining" ("animal_id","joined_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fattening_joining_move_uidx" ON "fattening_joining" ("move_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fattening_joining_sale_uidx" ON "fattening_joining" ("internal_sale_id");--> statement-breakpoint
ALTER TABLE "fattening_joining" ADD CONSTRAINT "fattening_joining_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "fattening_joining" ADD CONSTRAINT "fattening_joining_animal_id_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animal"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "fattening_joining" ADD CONSTRAINT "fattening_joining_move_id_animal_move_id_fkey" FOREIGN KEY ("move_id") REFERENCES "animal_move"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "fattening_joining" ADD CONSTRAINT "fattening_joining_internal_sale_id_internal_sale_id_fkey" FOREIGN KEY ("internal_sale_id") REFERENCES "internal_sale"("id");--> statement-breakpoint
ALTER TABLE "fattening_joining" ADD CONSTRAINT "fattening_joining_weigh_in_id_weigh_in_id_fkey" FOREIGN KEY ("weigh_in_id") REFERENCES "weigh_in"("id");--> statement-breakpoint
ALTER TABLE "fattening_joining" ADD CONSTRAINT "fattening_joining_priced_by_user_id_fkey" FOREIGN KEY ("priced_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "fattening_joining" ADD CONSTRAINT "fattening_joining_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");