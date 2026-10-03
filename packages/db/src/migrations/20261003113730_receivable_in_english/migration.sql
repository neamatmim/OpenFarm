ALTER TABLE "baki_payment" RENAME TO "receivable_payment";--> statement-breakpoint
ALTER TABLE "baki_write_off" RENAME TO "receivable_write_off";--> statement-breakpoint
ALTER TABLE "farm" RENAME COLUMN "baki_days" TO "receivable_days";--> statement-breakpoint
ALTER TABLE "sale" RENAME COLUMN "baki_money" TO "receivable_money";--> statement-breakpoint
ALTER TABLE "dispatch" RENAME COLUMN "baki_money" TO "receivable_money";--> statement-breakpoint
ALTER INDEX "baki_payment_buyer_idx" RENAME TO "receivable_payment_buyer_idx";--> statement-breakpoint
ALTER INDEX "baki_write_off_source_idx" RENAME TO "receivable_write_off_source_idx";--> statement-breakpoint
ALTER TABLE "receivable_payment" RENAME CONSTRAINT "baki_payment_farm_id_farm_id_fkey" TO "receivable_payment_farm_id_farm_id_fkey";--> statement-breakpoint
ALTER TABLE "receivable_payment" RENAME CONSTRAINT "baki_payment_counterparty_id_counterparty_id_fkey" TO "receivable_payment_counterparty_id_counterparty_id_fkey";--> statement-breakpoint
ALTER TABLE "receivable_payment" RENAME CONSTRAINT "baki_payment_recorded_by_user_id_fkey" TO "receivable_payment_recorded_by_user_id_fkey";--> statement-breakpoint
ALTER TABLE "receivable_write_off" RENAME CONSTRAINT "baki_write_off_farm_id_farm_id_fkey" TO "receivable_write_off_farm_id_farm_id_fkey";--> statement-breakpoint
ALTER TABLE "receivable_write_off" RENAME CONSTRAINT "baki_write_off_counterparty_id_counterparty_id_fkey" TO "receivable_write_off_counterparty_id_counterparty_id_fkey";--> statement-breakpoint
ALTER TABLE "receivable_write_off" RENAME CONSTRAINT "baki_write_off_recorded_by_user_id_fkey" TO "receivable_write_off_recorded_by_user_id_fkey";--> statement-breakpoint
ALTER TABLE "receivable_payment" RENAME CONSTRAINT "baki_payment_pkey" TO "receivable_payment_pkey";--> statement-breakpoint
ALTER TABLE "receivable_write_off" RENAME CONSTRAINT "baki_write_off_pkey" TO "receivable_write_off_pkey";--> statement-breakpoint
-- What the rows say of it: a notice's kind, what an audit or a review is about, where money came from.
UPDATE "alert" SET "kind" = 'receivable_overdue' WHERE "kind" = 'baki_overdue';--> statement-breakpoint
UPDATE "text_message" SET "kind" = 'receivable_overdue' WHERE "kind" = 'baki_overdue';--> statement-breakpoint
UPDATE "money_event" SET "source" = 'receivable_payment' WHERE "source" = 'baki_payment';--> statement-breakpoint
UPDATE "alert" SET "entity" = replace("entity", 'baki', 'receivable') WHERE "entity" IN ('baki', 'baki_payment', 'baki_write_off');--> statement-breakpoint
UPDATE "audit_event" SET "entity" = replace("entity", 'baki', 'receivable') WHERE "entity" IN ('baki', 'baki_payment', 'baki_write_off');--> statement-breakpoint
UPDATE "needs_review" SET "entity" = replace("entity", 'baki', 'receivable') WHERE "entity" IN ('baki', 'baki_payment', 'baki_write_off');--> statement-breakpoint
-- And inside what is kept as JSON: every key (bakiMoney, creditMoney), and the values above where a snapshot or a
-- refusal kept them. Words people typed are left as they typed them.
CREATE FUNCTION "receivable_key"("key" text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN "key" = 'creditMoney' THEN 'paidAheadMoney'
    ELSE replace(replace(replace(replace(replace(replace("key",
      'OnBaki', 'OnCredit'), 'onBaki', 'onCredit'),
      'BAKI', 'RECEIVABLE'), 'Baki', 'Receivable'), 'baki', 'receivable'), 'receivable.credit', 'receivable.paidAhead')
  END
$$;--> statement-breakpoint
CREATE FUNCTION "receivable_keys"("value" jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN CASE jsonb_typeof("value")
    WHEN 'object' THEN (
      SELECT coalesce(jsonb_object_agg("receivable_key"("k"), "receivable_keys"("v")), '{}'::jsonb)
      FROM jsonb_each("value") AS "e"("k", "v")
    )
    WHEN 'array' THEN (
      SELECT coalesce(jsonb_agg("receivable_keys"("v") ORDER BY "n"), '[]'::jsonb)
      FROM jsonb_array_elements("value") WITH ORDINALITY AS "e"("v", "n")
    )
    WHEN 'string' THEN CASE
      WHEN "value" #>> '{}' IN ('baki_payment', 'baki_write_off', 'baki_overdue', 'baki_needs_a_promise')
        THEN to_jsonb(replace("value" #>> '{}', 'baki', 'receivable'))
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
      'UPDATE %I SET %I = "receivable_keys"(%I) WHERE %I::text ~ %L',
      "c"."table_name", "c"."column_name", "c"."column_name", "c"."column_name", '[Bb]aki|BAKI|creditMoney'
    );
  END LOOP;
END
$$;--> statement-breakpoint
DROP FUNCTION "receivable_keys"(jsonb);--> statement-breakpoint
DROP FUNCTION "receivable_key"(text);--> statement-breakpoint
-- PostgreSQL 18 names each NOT NULL after its column as the table is made, and keeps that name when the column is
-- renamed: sale_baki_bdt_not_null, after both renames. Each is named for its column as it is now.
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
    -- Cut at 63 characters, as PostgreSQL cuts the names it makes itself.
    IF "c"."old" <> "c"."new" THEN
      EXECUTE format('ALTER TABLE %s RENAME CONSTRAINT %I TO %I', "c"."tab", "c"."old", "c"."new");
    END IF;
  END LOOP;
END
$$;
