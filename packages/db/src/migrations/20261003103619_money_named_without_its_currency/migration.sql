ALTER TABLE "farm" RENAME COLUMN "running_budget_warn_bdt" TO "running_budget_warn_money";--> statement-breakpoint
ALTER TABLE "farm" RENAME COLUMN "adjustment_threshold_bdt" TO "adjustment_threshold_money";--> statement-breakpoint
ALTER TABLE "farm" RENAME COLUMN "approval_threshold_bdt" TO "approval_threshold_money";--> statement-breakpoint
ALTER TABLE "farm" RENAME COLUMN "store_shortfall_tell_bdt" TO "store_shortfall_tell_money";--> statement-breakpoint
ALTER TABLE "farm" RENAME COLUMN "cash_short_tell_bdt" TO "cash_short_tell_money";--> statement-breakpoint
ALTER TABLE "farm" RENAME COLUMN "medicine_short_tell_bdt" TO "medicine_short_tell_money";--> statement-breakpoint
ALTER TABLE "farm" RENAME COLUMN "market_low_bdt_per_kg" TO "market_low_money_per_kg";--> statement-breakpoint
ALTER TABLE "farm" RENAME COLUMN "market_high_bdt_per_kg" TO "market_high_money_per_kg";--> statement-breakpoint
ALTER TABLE "fattening_joining" RENAME COLUMN "price_bdt" TO "price_money";--> statement-breakpoint
ALTER TABLE "fattening_joining" RENAME COLUMN "rate_bdt_per_kg" TO "rate_money_per_kg";--> statement-breakpoint
ALTER TABLE "intake" RENAME COLUMN "purchase_price_bdt" TO "purchase_price_money";--> statement-breakpoint
ALTER TABLE "intake" RENAME COLUMN "hasil_bdt" TO "hasil_money";--> statement-breakpoint
ALTER TABLE "internal_sale" RENAME COLUMN "rate_bdt_per_kg" TO "rate_money_per_kg";--> statement-breakpoint
ALTER TABLE "internal_sale" RENAME COLUMN "price_bdt" TO "price_money";--> statement-breakpoint
ALTER TABLE "sale" RENAME COLUMN "price_bdt" TO "price_money";--> statement-breakpoint
ALTER TABLE "sale" RENAME COLUMN "baki_bdt" TO "baki_money";--> statement-breakpoint
ALTER TABLE "sale" RENAME COLUMN "broker_bdt" TO "broker_money";--> statement-breakpoint
ALTER TABLE "feed_in" RENAME COLUMN "price_bdt" TO "price_money";--> statement-breakpoint
ALTER TABLE "feed_item" RENAME COLUMN "fodder_price_bdt" TO "fodder_price_money";--> statement-breakpoint
ALTER TABLE "dispatch" RENAME COLUMN "price_per_litre_bdt" TO "price_per_litre_money";--> statement-breakpoint
ALTER TABLE "dispatch" RENAME COLUMN "baki_bdt" TO "baki_money";--> statement-breakpoint
ALTER TABLE "baki_payment" RENAME COLUMN "amount_bdt" TO "amount_money";--> statement-breakpoint
ALTER TABLE "baki_write_off" RENAME COLUMN "amount_bdt" TO "amount_money";--> statement-breakpoint
ALTER TABLE "farm_account_check" RENAME COLUMN "read_bdt" TO "read_money";--> statement-breakpoint
ALTER TABLE "farm_account_check" RENAME COLUMN "expected_bdt" TO "expected_money";--> statement-breakpoint
ALTER TABLE "handover" RENAME COLUMN "amount_bdt" TO "amount_money";--> statement-breakpoint
ALTER TABLE "medicine_purchase" RENAME COLUMN "price_bdt" TO "price_money";--> statement-breakpoint
ALTER TABLE "money_event" RENAME COLUMN "amount_bdt" TO "amount_money";--> statement-breakpoint
ALTER TABLE "vet_fee" RENAME COLUMN "amount_bdt" TO "amount_money";--> statement-breakpoint
ALTER TABLE "wage_draw" RENAME COLUMN "amount_bdt" TO "amount_money";--> statement-breakpoint
ALTER TABLE "wage_draw_taken" RENAME COLUMN "bdt" TO "amount";--> statement-breakpoint
ALTER TABLE "dairy_entry_price" RENAME COLUMN "price_bdt" TO "price_money";--> statement-breakpoint
ALTER TABLE "head_price" RENAME COLUMN "low_bdt" TO "low_money";--> statement-breakpoint
ALTER TABLE "head_price" RENAME COLUMN "high_bdt" TO "high_money";--> statement-breakpoint
ALTER TABLE "buying_trip" RENAME COLUMN "broker_bdt" TO "broker_money";--> statement-breakpoint
ALTER TABLE "buying_trip" RENAME COLUMN "transport_bdt" TO "transport_money";--> statement-breakpoint
ALTER TABLE "buying_trip" RENAME COLUMN "keep_bdt" TO "keep_money";--> statement-breakpoint
ALTER TABLE "selling_trip" RENAME COLUMN "transport_bdt" TO "transport_money";--> statement-breakpoint
ALTER TABLE "selling_trip" RENAME COLUMN "keep_bdt" TO "keep_money";--> statement-breakpoint
ALTER TABLE "investment_agreement" RENAME COLUMN "stamp_value_bdt" TO "stamp_value_money";--> statement-breakpoint
ALTER TABLE "venture_settlement_adjustment" RENAME COLUMN "profit_bdt" TO "profit_money";--> statement-breakpoint
ALTER TABLE "venture_settlement_adjustment" RENAME COLUMN "per_unit_bdt" TO "per_unit_money";--> statement-breakpoint
ALTER TABLE "venture_settlement_adjustment" RENAME COLUMN "per_unit_difference_bdt" TO "per_unit_difference_money";--> statement-breakpoint
ALTER TABLE "venture_settlement_adjustment" RENAME COLUMN "investors_difference_bdt" TO "investors_difference_money";--> statement-breakpoint
ALTER TABLE "venture_settlement_adjustment" RENAME COLUMN "threshold_bdt" TO "threshold_money";--> statement-breakpoint
ALTER TABLE "venture" RENAME COLUMN "target_capital_bdt" TO "target_capital_money";--> statement-breakpoint
ALTER TABLE "venture" RENAME COLUMN "floor_bdt" TO "floor_money";--> statement-breakpoint
ALTER TABLE "venture" RENAME COLUMN "unit_price_bdt" TO "unit_price_money";--> statement-breakpoint
ALTER TABLE "venture" RENAME COLUMN "cattle_budget_bdt" TO "cattle_budget_money";--> statement-breakpoint
ALTER TABLE "venture" RENAME COLUMN "cattle_part_bdt" TO "cattle_part_money";--> statement-breakpoint
ALTER TABLE "venture_bank_check" RENAME COLUMN "read_bdt" TO "read_money";--> statement-breakpoint
ALTER TABLE "venture_bank_check" RENAME COLUMN "expected_bdt" TO "expected_money";--> statement-breakpoint
ALTER TABLE "venture_movement" RENAME COLUMN "amount_bdt" TO "amount_money";--> statement-breakpoint
ALTER TABLE "venture_plan" RENAME COLUMN "sale_low_bdt_per_kg" TO "sale_low_money_per_kg";--> statement-breakpoint
ALTER TABLE "venture_plan" RENAME COLUMN "sale_high_bdt_per_kg" TO "sale_high_money_per_kg";--> statement-breakpoint
ALTER TABLE "venture_plan_line" RENAME COLUMN "buy_bdt_per_kg" TO "buy_money_per_kg";--> statement-breakpoint
ALTER TABLE "venture_settlement" RENAME COLUMN "proceeds_bdt" TO "proceeds_money";--> statement-breakpoint
ALTER TABLE "venture_settlement" RENAME COLUMN "charged_bdt" TO "charged_money";--> statement-breakpoint
ALTER TABLE "venture_settlement" RENAME COLUMN "profit_bdt" TO "profit_money";--> statement-breakpoint
ALTER TABLE "venture_settlement" RENAME COLUMN "investors_bdt" TO "investors_money";--> statement-breakpoint
ALTER TABLE "venture_settlement" RENAME COLUMN "per_unit_bdt" TO "per_unit_money";--> statement-breakpoint
ALTER TABLE "venture_settlement" RENAME COLUMN "rounding_bdt" TO "rounding_money";--> statement-breakpoint
ALTER TABLE "venture_settlement" RENAME COLUMN "farm_bdt" TO "farm_money";--> statement-breakpoint
ALTER TABLE "venture_settlement" RENAME COLUMN "advance_bdt" TO "advance_money";--> statement-breakpoint
ALTER TABLE "venture_settlement" RENAME COLUMN "capital_bdt" TO "capital_money";--> statement-breakpoint
ALTER TABLE "venture_settlement" RENAME COLUMN "balance_bdt" TO "balance_money";--> statement-breakpoint
ALTER TABLE "venture_settlement_share" RENAME COLUMN "capital_bdt" TO "capital_money";--> statement-breakpoint
ALTER TABLE "venture_settlement_share" RENAME COLUMN "share_bdt" TO "share_money";--> statement-breakpoint
ALTER TABLE "venture_settlement_share" RENAME COLUMN "payout_bdt" TO "payout_money";--> statement-breakpoint
-- The same names inside what is kept as JSON: a notice's fillings, an audit's before and after, a Venture's
-- frozen paper and charges, what a Reimbursement carried. A Sale's audit kept its broker's Money Event as
-- "brokerMoney", which is now the broker's price, so that one is named for the event first.
CREATE FUNCTION "money_key"("key" text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN "key" = 'brokerMoney' THEN 'brokerMoneyEvent'
    WHEN "key" = 'bdt' THEN 'amount'
    WHEN "key" = 'bdtOf' THEN 'amountOf'
    ELSE regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace("key",
      '([a-z0-9])Bdt', '\1Money', 'g'),
      '_bdt(_|$)', '_money\1', 'g'),
      '^bdt(Per[A-Z])', 'money\1'),
      '_BDT($|_)', '_MONEY\1', 'g'),
      '^BDT_', 'MONEY_')
  END
$$;--> statement-breakpoint
CREATE FUNCTION "money_keys"("value" jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN CASE jsonb_typeof("value")
    WHEN 'object' THEN (
      SELECT coalesce(jsonb_object_agg("money_key"("k"), "money_keys"("v")), '{}'::jsonb)
      FROM jsonb_each("value") AS "e"("k", "v")
    )
    WHEN 'array' THEN (
      SELECT coalesce(jsonb_agg("money_keys"("v") ORDER BY "n"), '[]'::jsonb)
      FROM jsonb_array_elements("value") WITH ORDINALITY AS "e"("v", "n")
    )
    ELSE "value"
  END;
END
$$;--> statement-breakpoint
DO $$
DECLARE "c" record;
BEGIN
  FOR "c" IN
    SELECT "table_name", "column_name" FROM information_schema.columns
    WHERE "table_schema" = 'public' AND "data_type" = 'jsonb'
  LOOP
    EXECUTE format(
      'UPDATE %I SET %I = "money_keys"(%I) WHERE %I::text ~ %L',
      "c"."table_name", "c"."column_name", "c"."column_name", "c"."column_name", '[Bb]dt|BDT|brokerMoney'
    );
  END LOOP;
END
$$;--> statement-breakpoint
DROP FUNCTION "money_keys"(jsonb);--> statement-breakpoint
DROP FUNCTION "money_key"(text);
