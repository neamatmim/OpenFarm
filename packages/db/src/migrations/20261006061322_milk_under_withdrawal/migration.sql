ALTER TABLE "milk_record" ADD COLUMN "under_withdrawal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- A record the gate forced was a cow under Withdrawal. One a phone sent to Discard itself while she was held cannot
-- be told from milk poured away by judgement after the fact, and stays as it was read before.
UPDATE "milk_record" SET "under_withdrawal" = true WHERE "forced";
