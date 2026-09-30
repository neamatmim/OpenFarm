CREATE TABLE "medicine_count" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"drug_product_id" text NOT NULL,
	"completion_id" text NOT NULL,
	"counted_at" timestamp NOT NULL,
	"expected" integer NOT NULL,
	"counted" integer NOT NULL,
	"reason" text,
	"counted_by" text,
	"recorded_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "medicine_short_tell_bdt" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "medicine_count_line_uidx" ON "medicine_count" ("completion_id","drug_product_id");--> statement-breakpoint
CREATE INDEX "medicine_count_product_idx" ON "medicine_count" ("farm_id","drug_product_id","counted_at");--> statement-breakpoint
ALTER TABLE "medicine_count" ADD CONSTRAINT "medicine_count_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "medicine_count" ADD CONSTRAINT "medicine_count_drug_product_id_drug_product_id_fkey" FOREIGN KEY ("drug_product_id") REFERENCES "drug_product"("id");--> statement-breakpoint
ALTER TABLE "medicine_count" ADD CONSTRAINT "medicine_count_counted_by_user_id_fkey" FOREIGN KEY ("counted_by") REFERENCES "user"("id");