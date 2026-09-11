CREATE TABLE "drug_product" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"name_bn" text NOT NULL,
	"name_en" text,
	"milk_withdrawal_days" integer,
	"meat_withdrawal_days" integer,
	"days_set_by" text,
	"days_set_at" timestamp,
	"retired_at" timestamp,
	"added_by" text,
	"added_by_role" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "drug_product_name_uidx" ON "drug_product" ("farm_id","name_bn");--> statement-breakpoint
CREATE INDEX "drug_product_farm_idx" ON "drug_product" ("farm_id");--> statement-breakpoint
ALTER TABLE "drug_product" ADD CONSTRAINT "drug_product_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "drug_product" ADD CONSTRAINT "drug_product_days_set_by_user_id_fkey" FOREIGN KEY ("days_set_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "drug_product" ADD CONSTRAINT "drug_product_added_by_user_id_fkey" FOREIGN KEY ("added_by") REFERENCES "user"("id");