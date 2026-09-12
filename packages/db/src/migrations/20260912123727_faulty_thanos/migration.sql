CREATE TABLE "counterparty" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"name" text NOT NULL,
	"place" text,
	"phone" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intake" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"counterparty_id" text,
	"purchase_price_bdt" numeric(12,2) NOT NULL,
	"weight_kg" numeric(7,2) NOT NULL,
	"estimated_age_months" integer,
	"target_window_start" text NOT NULL,
	"target_window_end" text NOT NULL,
	"target_weight_kg" numeric(7,2) NOT NULL,
	"arrived_at" timestamp NOT NULL,
	"recorded_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "fattening_target_weight_kg" integer DEFAULT 350 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "counterparty_name_uidx" ON "counterparty" ("farm_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "intake_animal_uidx" ON "intake" ("animal_id");--> statement-breakpoint
CREATE INDEX "intake_window_idx" ON "intake" ("farm_id","target_window_start");--> statement-breakpoint
ALTER TABLE "counterparty" ADD CONSTRAINT "counterparty_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "intake" ADD CONSTRAINT "intake_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "intake" ADD CONSTRAINT "intake_animal_id_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animal"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "intake" ADD CONSTRAINT "intake_counterparty_id_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparty"("id");--> statement-breakpoint
ALTER TABLE "intake" ADD CONSTRAINT "intake_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");