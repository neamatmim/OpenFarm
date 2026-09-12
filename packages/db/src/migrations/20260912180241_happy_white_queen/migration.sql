CREATE TABLE "sale" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"counterparty_id" text NOT NULL,
	"price_bdt" numeric(12,2) NOT NULL,
	"weight_kg" numeric(7,2) NOT NULL,
	"destination" text NOT NULL,
	"vehicle" text NOT NULL,
	"driver" text NOT NULL,
	"note" text,
	"sold_at" timestamp NOT NULL,
	"recorded_by" text,
	"recorded_by_role" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "sale_animal_uidx" ON "sale" ("animal_id");--> statement-breakpoint
CREATE INDEX "sale_day_idx" ON "sale" ("farm_id","sold_at");--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_animal_id_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animal"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_counterparty_id_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparty"("id");--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");