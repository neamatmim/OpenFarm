ALTER TABLE "dispatch" RENAME COLUMN "challan" TO "delivery_note";--> statement-breakpoint
-- The key a Dispatch kept it under inside JSON — an audit's before and after, a queued entry. A stamp's e-challan
-- is the treasury's, and is left alone.
CREATE FUNCTION "delivery_note_in"("value" jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN CASE jsonb_typeof("value")
    WHEN 'object' THEN (
      SELECT coalesce(
        jsonb_object_agg(CASE WHEN "k" = 'challan' THEN 'deliveryNote' ELSE "k" END, "delivery_note_in"("v")),
        '{}'::jsonb
      )
      FROM jsonb_each("value") AS "e"("k", "v")
    )
    WHEN 'array' THEN (
      SELECT coalesce(jsonb_agg("delivery_note_in"("v") ORDER BY "n"), '[]'::jsonb)
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
      'UPDATE %I SET %I = "delivery_note_in"(%I) WHERE %I::text ~ %L',
      "c"."table_name", "c"."column_name", "c"."column_name", "c"."column_name", '"challan"'
    );
  END LOOP;
END
$$;--> statement-breakpoint
DROP FUNCTION "delivery_note_in"(jsonb);
