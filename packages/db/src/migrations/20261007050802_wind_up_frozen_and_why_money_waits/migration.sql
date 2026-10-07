ALTER TABLE "money_event" ADD COLUMN "awaiting_in_pieces" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "venture" ADD COLUMN "wind_up_days" integer;--> statement-breakpoint
ALTER TABLE "venture" ADD CONSTRAINT "venture_wind_up_days_not_negative" CHECK (wind_up_days >= 0);--> statement-breakpoint
-- Money waiting now under the line in force now waits because of its pieces: the reading the Owner was shown until
-- this was kept.
UPDATE "money_event" SET "awaiting_in_pieces" = true
FROM "farm"
WHERE "farm"."id" = "money_event"."farm_id"
  AND "money_event"."approval" = 'awaiting'
  AND "money_event"."amount_money" <= "farm"."approval_threshold_money";--> statement-breakpoint
-- A Venture an Investor has already signed for keeps the Wind-up days the farm had when this was put right: the nearest
-- the farm can say to what their Agreement named. One nobody has signed for keeps reading the farm's Parameter.
UPDATE "venture" SET "wind_up_days" = "farm"."wind_up_days"
FROM "farm"
WHERE "farm"."id" = "venture"."farm_id"
  AND EXISTS (
    SELECT 1 FROM "investment_agreement"
    WHERE "investment_agreement"."venture_id" = "venture"."id"
  );
