ALTER TABLE "intake" RENAME COLUMN "hasil_money" TO "market_toll_money";--> statement-breakpoint
-- And inside what is kept as JSON: every key named for it (hasilMoney), and the word a Venture's settled charges and
-- an animal's costs kept it under. Words people typed are left as they typed them.
CREATE FUNCTION "market_toll_in"("value" jsonb, "under" text) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN CASE jsonb_typeof("value")
    WHEN 'object' THEN (
      SELECT coalesce(
        jsonb_object_agg(
          replace(replace(replace("k", 'Hasil', 'MarketToll'), 'hasil_', 'market_toll_'), 'hasil', 'marketToll'),
          "market_toll_in"("v", "k")
        ),
        '{}'::jsonb
      )
      FROM jsonb_each("value") AS "e"("k", "v")
    )
    WHEN 'array' THEN (
      SELECT coalesce(jsonb_agg("market_toll_in"("v", "under") ORDER BY "n"), '[]'::jsonb)
      FROM jsonb_array_elements("value") WITH ORDINALITY AS "e"("v", "n")
    )
    WHEN 'string' THEN CASE
      WHEN "value" #>> '{}' = 'hasil' AND "under" IN ('word', 'kind', 'charge', 'source')
        THEN '"market_toll"'::jsonb
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
      'UPDATE %I SET %I = "market_toll_in"(%I, NULL) WHERE %I::text ~* %L',
      "c"."table_name", "c"."column_name", "c"."column_name", "c"."column_name", 'hasil'
    );
  END LOOP;
END
$$;--> statement-breakpoint
DROP FUNCTION "market_toll_in"(jsonb, text);--> statement-breakpoint
-- Each NOT NULL named for its column as it is now, as the Receivable migration does.
DO $$
DECLARE "c" record;
BEGIN
  FOR "c" IN
    SELECT "con"."conrelid"::regclass AS "tab", "con"."conname" AS "old",
      left("cls"."relname" || '_' || "att"."attname" || '_not_null', 63) AS "new"
    FROM pg_constraint AS "con"
    JOIN pg_class AS "cls" ON "cls"."oid" = "con"."conrelid"
    JOIN pg_namespace AS "ns" ON "ns"."oid" = "cls"."relnamespace"
    JOIN pg_attribute AS "att" ON "att"."attrelid" = "con"."conrelid" AND "att"."attnum" = "con"."conkey"[1]
    WHERE "con"."contype" = 'n' AND "ns"."nspname" = 'public'
  LOOP
    IF "c"."old" <> "c"."new" THEN
      EXECUTE format('ALTER TABLE %s RENAME CONSTRAINT %I TO %I', "c"."tab", "c"."old", "c"."new");
    END IF;
  END LOOP;
END
$$;
