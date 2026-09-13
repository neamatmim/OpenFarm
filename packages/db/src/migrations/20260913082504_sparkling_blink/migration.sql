CREATE TABLE "medicine_purchase" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"drug_product_id" text NOT NULL,
	"quantity" text NOT NULL,
	"doses" integer NOT NULL,
	"price_bdt" numeric(12,2) NOT NULL,
	"counterparty_id" text NOT NULL,
	"purchased_on" timestamp NOT NULL,
	"recorded_by" text,
	"recorded_by_role" text NOT NULL,
	"recorded_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "money_category" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"key" text,
	"name_bn" text NOT NULL,
	"name_en" text,
	"direction" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "money_event" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"direction" text NOT NULL,
	"amount_bdt" numeric(12,2) NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"category_id" text NOT NULL,
	"counterparty_id" text,
	"payment_method" text NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"approval" text NOT NULL,
	"approved_by" text,
	"approved_at" timestamp,
	"recorded_by" text,
	"recorded_by_role" text NOT NULL,
	"recorded_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vet_fee" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"vet_id" text NOT NULL,
	"amount_bdt" numeric(12,2) NOT NULL,
	"visited_on" timestamp NOT NULL,
	"note" text,
	"recorded_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vet_fee_animal" (
	"vet_fee_id" text,
	"animal_id" text,
	CONSTRAINT "vet_fee_animal_pkey" PRIMARY KEY("vet_fee_id","animal_id")
);
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "approval_threshold_bdt" integer DEFAULT 20000 NOT NULL;--> statement-breakpoint
CREATE INDEX "medicine_purchase_product_idx" ON "medicine_purchase" ("farm_id","drug_product_id","purchased_on");--> statement-breakpoint
CREATE UNIQUE INDEX "money_category_key_uidx" ON "money_category" ("farm_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "money_category_name_uidx" ON "money_category" ("farm_id","name_bn");--> statement-breakpoint
CREATE UNIQUE INDEX "money_event_source_uidx" ON "money_event" ("source","source_id");--> statement-breakpoint
CREATE INDEX "money_event_day_idx" ON "money_event" ("farm_id","occurred_at");--> statement-breakpoint
CREATE INDEX "money_event_approval_idx" ON "money_event" ("farm_id","approval");--> statement-breakpoint
CREATE INDEX "vet_fee_vet_idx" ON "vet_fee" ("farm_id","vet_id");--> statement-breakpoint
ALTER TABLE "medicine_purchase" ADD CONSTRAINT "medicine_purchase_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "medicine_purchase" ADD CONSTRAINT "medicine_purchase_drug_product_id_drug_product_id_fkey" FOREIGN KEY ("drug_product_id") REFERENCES "drug_product"("id");--> statement-breakpoint
ALTER TABLE "medicine_purchase" ADD CONSTRAINT "medicine_purchase_counterparty_id_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparty"("id");--> statement-breakpoint
ALTER TABLE "medicine_purchase" ADD CONSTRAINT "medicine_purchase_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "money_category" ADD CONSTRAINT "money_category_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "money_event" ADD CONSTRAINT "money_event_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "money_event" ADD CONSTRAINT "money_event_category_id_money_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "money_category"("id");--> statement-breakpoint
ALTER TABLE "money_event" ADD CONSTRAINT "money_event_counterparty_id_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparty"("id");--> statement-breakpoint
ALTER TABLE "money_event" ADD CONSTRAINT "money_event_approved_by_user_id_fkey" FOREIGN KEY ("approved_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "money_event" ADD CONSTRAINT "money_event_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "vet_fee" ADD CONSTRAINT "vet_fee_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "vet_fee" ADD CONSTRAINT "vet_fee_vet_id_user_id_fkey" FOREIGN KEY ("vet_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "vet_fee_animal" ADD CONSTRAINT "vet_fee_animal_vet_fee_id_vet_fee_id_fkey" FOREIGN KEY ("vet_fee_id") REFERENCES "vet_fee"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "vet_fee_animal" ADD CONSTRAINT "vet_fee_animal_animal_id_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animal"("id");