--> Hand-written where drizzle-kit could not be: a Treatment now carries the product itself,
--> and every row already on a farm was written by a Prescription that knows which it was.
--> Adding the column NOT NULL outright would refuse to run on any farm that has treated an
--> animal, which is every farm that has used the feature.
ALTER TABLE "treatment" ADD COLUMN "product_id" text;--> statement-breakpoint
UPDATE "treatment" SET "product_id" = "prescription"."product_id" FROM "prescription" WHERE "prescription"."id" = "treatment"."prescription_id";--> statement-breakpoint
ALTER TABLE "treatment" ALTER COLUMN "product_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "treatment" ALTER COLUMN "prescription_id" DROP NOT NULL;--> statement-breakpoint
DROP INDEX "treatment_instance_uidx";--> statement-breakpoint
CREATE UNIQUE INDEX "treatment_dose_uidx" ON "treatment" ("instance_id","animal_id");--> statement-breakpoint
ALTER TABLE "treatment" ADD CONSTRAINT "treatment_product_id_drug_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "drug_product"("id");
