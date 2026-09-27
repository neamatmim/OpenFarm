-- What a buying outing cost was booked as the Farm's even when a Venture's Buying Float paid for it, because the
-- outing is written up before its Float is drawn. The Float is the Animals bought, the outing's costs and the cash
-- brought back, so that money was the Venture's, as the Animals' prices on the same outing already are. Moves each
-- such Money Event into the purse of the Venture whose Float paid; an outing no Float paid for stays the Farm's.
UPDATE "money_event" AS "booked"
SET "purse_venture_id" = "float"."venture_id"
FROM "venture_movement" AS "float"
WHERE "booked"."source" = 'buying_trip'
  AND "float"."kind" = 'float_out'
  AND "float"."farm_id" = "booked"."farm_id"
  AND "float"."buying_trip_id" = "booked"."source_id"
  AND "booked"."purse_venture_id" IS DISTINCT FROM "float"."venture_id";
