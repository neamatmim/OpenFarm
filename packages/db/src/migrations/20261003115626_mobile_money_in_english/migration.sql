-- bKash is one company's mobile money; the farm's money by it is mobile money, as M-Pesa's is elsewhere.
UPDATE "money_event" SET "payment_method" = 'mobile_money' WHERE "payment_method" = 'bkash';--> statement-breakpoint
UPDATE "farm_account" SET "kind" = 'mobile_money' WHERE "kind" = 'bkash';--> statement-breakpoint
-- And inside what is kept as JSON: the same value where a snapshot, a queued entry or a notice kept it as a way of
-- paying or a kind of account, the refusal a Venture's sale by it got, and any key named for it. Words people typed
-- are left as they typed them.
CREATE FUNCTION "mobile_money_in"("value" jsonb, "under" text) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN CASE jsonb_typeof("value")
    WHEN 'object' THEN (
      SELECT coalesce(
        jsonb_object_agg(
          replace(replace(replace("k", 'Bkash', 'MobileMoney'), 'BKASH', 'MOBILE_MONEY'), 'bkash', 'mobile_money'),
          "mobile_money_in"("v", "k")
        ),
        '{}'::jsonb
      )
      FROM jsonb_each("value") AS "e"("k", "v")
    )
    WHEN 'array' THEN (
      SELECT coalesce(jsonb_agg("mobile_money_in"("v", "under") ORDER BY "n"), '[]'::jsonb)
      FROM jsonb_array_elements("value") WITH ORDINALITY AS "e"("v", "n")
    )
    WHEN 'string' THEN CASE
      WHEN "value" #>> '{}' = 'bkash' AND "under" IN ('paymentMethod', 'kind', 'method', 'methods', 'kinds')
        THEN '"mobile_money"'::jsonb
      WHEN "value" #>> '{}' = 'venture_sale_not_by_bkash' THEN '"venture_sale_not_by_mobile_money"'::jsonb
      ELSE "value"
    END
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
      'UPDATE %I SET %I = "mobile_money_in"(%I, NULL) WHERE %I::text ~* %L',
      "c"."table_name", "c"."column_name", "c"."column_name", "c"."column_name", 'bkash'
    );
  END LOOP;
END
$$;--> statement-breakpoint
DROP FUNCTION "mobile_money_in"(jsonb, text);
