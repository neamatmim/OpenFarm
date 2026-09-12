ALTER TABLE "treatment" ADD COLUMN "product_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "treatment" ALTER COLUMN "prescription_id" DROP NOT NULL;--> statement-breakpoint
DROP INDEX "treatment_instance_uidx";--> statement-breakpoint
CREATE UNIQUE INDEX "treatment_instance_uidx" ON "treatment" ("instance_id","animal_id");--> statement-breakpoint
ALTER TABLE "treatment" ADD CONSTRAINT "treatment_product_id_drug_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "drug_product"("id");