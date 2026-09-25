ALTER TABLE "venture" ADD COLUMN "ordinal" integer;--> statement-breakpoint
ALTER TABLE "investment_agreement" ADD COLUMN "pay_in_code" text;--> statement-breakpoint
-- Every Venture its place on its farm in the order it was opened, counted from one.
UPDATE "venture" SET "ordinal" = "placed"."ordinal"
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "farm_id" ORDER BY "created_at", "id") AS "ordinal"
  FROM "venture"
) AS "placed"
WHERE "placed"."id" = "venture"."id";--> statement-breakpoint
-- Every Agreement recorded before the codes its Pay-in Code: its Venture's place, then its own on that Venture in
-- the order it was signed, as signing writes one — PAY-3-07, the second number never under two digits.
UPDATE "investment_agreement" SET "pay_in_code" =
  'PAY-' || "placed"."venture_ordinal" || '-' || lpad("placed"."ordinal"::text, greatest(2, length("placed"."ordinal"::text)), '0')
FROM (
  SELECT "investment_agreement"."id", "venture"."ordinal" AS "venture_ordinal",
    row_number() OVER (PARTITION BY "investment_agreement"."venture_id" ORDER BY "investment_agreement"."created_at", "investment_agreement"."id") AS "ordinal"
  FROM "investment_agreement"
  JOIN "venture" ON "venture"."id" = "investment_agreement"."venture_id"
) AS "placed"
WHERE "placed"."id" = "investment_agreement"."id";--> statement-breakpoint
ALTER TABLE "venture" ALTER COLUMN "ordinal" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "investment_agreement" ALTER COLUMN "pay_in_code" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "investment_agreement_pay_in_code_uidx" ON "investment_agreement" ("farm_id","pay_in_code");--> statement-breakpoint
CREATE UNIQUE INDEX "venture_ordinal_uidx" ON "venture" ("farm_id","ordinal");
