ALTER TABLE "treatment" ADD COLUMN "learnt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "animal" ADD COLUMN "milk_withdrawal_shortened_to" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "animal" ADD COLUMN "meat_withdrawal_shortened_to" timestamp with time zone;--> statement-breakpoint
-- A dose already given was learnt of when it was given, as far as the farm can now say; and it holds her for the days it held her for until today (the product's own, else the default kept on the dose).
UPDATE "treatment" SET "learnt_at" = "given_at" WHERE "given_at" IS NOT NULL;--> statement-breakpoint
UPDATE "treatment" AS t SET
  "milk_withdrawal_days" = COALESCE(p."milk_withdrawal_days", t."milk_withdrawal_days"),
  "meat_withdrawal_days" = COALESCE(p."meat_withdrawal_days", t."meat_withdrawal_days")
FROM "drug_product" AS p
WHERE p."id" = t."product_id" AND t."given_at" IS NOT NULL;--> statement-breakpoint
-- A hold the Vet shortened is where it stands now, where that differs from what her doses alone say; one ended outright, the moment it was ended.
UPDATE "animal" SET
  "milk_withdrawal_shortened_to" = CASE
    WHEN "milk_withdrawal_until" IS DISTINCT FROM "milk_withdrawal_from_doses"
      THEN COALESCE("milk_withdrawal_until", "withdrawal_shortened_at") END,
  "meat_withdrawal_shortened_to" = CASE
    WHEN "meat_withdrawal_until" IS DISTINCT FROM "meat_withdrawal_from_doses"
      THEN COALESCE("meat_withdrawal_until", "withdrawal_shortened_at") END
WHERE "withdrawal_shortened_at" IS NOT NULL;
