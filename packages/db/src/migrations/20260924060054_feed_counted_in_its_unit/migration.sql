ALTER TABLE "feed_in" ADD COLUMN "pack_kind" text;--> statement-breakpoint
ALTER TABLE "feed_in" ADD COLUMN "pack_count" numeric(10,1);--> statement-breakpoint
ALTER TABLE "feed_item" ADD COLUMN "bag_size_kg" numeric(8,1);--> statement-breakpoint
-- A unit typed by hand before the list was closed, as the closest the farm now keeps: kilos, litres, or else a count.
UPDATE "feed_item" SET "unit" = CASE
  WHEN lower(trim("unit")) IN ('kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms', 'কেজি') THEN 'kg'
  WHEN lower(trim("unit")) IN ('l', 'litre', 'litres', 'liter', 'liters', 'লিটার') THEN 'litre'
  ELSE 'bundle'
END WHERE "unit" NOT IN ('kg', 'litre', 'bundle');
