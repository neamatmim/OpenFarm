ALTER TABLE "milk_record" RENAME COLUMN "litres" TO "liters";--> statement-breakpoint
ALTER TABLE "milk_record" RENAME CONSTRAINT "milk_record_litres_not_null" TO "milk_record_liters_not_null";--> statement-breakpoint
ALTER TABLE "milk_record" RENAME CONSTRAINT "milk_record_litres_not_negative" TO "milk_record_liters_not_negative";--> statement-breakpoint
ALTER TABLE "dispatch" RENAME COLUMN "litres" TO "liters";--> statement-breakpoint
ALTER TABLE "dispatch" RENAME CONSTRAINT "dispatch_litres_not_null" TO "dispatch_liters_not_null";--> statement-breakpoint
ALTER TABLE "dispatch" RENAME CONSTRAINT "dispatch_litres_not_negative" TO "dispatch_liters_not_negative";--> statement-breakpoint
ALTER TABLE "dispatch" RENAME COLUMN "price_per_litre_money" TO "price_per_liter_money";--> statement-breakpoint
ALTER TABLE "dispatch" RENAME CONSTRAINT "dispatch_price_per_litre_money_not_null" TO "dispatch_price_per_liter_money_not_null";--> statement-breakpoint
ALTER TABLE "dispatch" RENAME CONSTRAINT "dispatch_price_per_litre_money_not_negative" TO "dispatch_price_per_liter_money_not_negative";--> statement-breakpoint
ALTER TABLE "milking_session" RENAME COLUMN "bulk_litres" TO "bulk_liters";--> statement-breakpoint
ALTER TABLE "milking_session" RENAME CONSTRAINT "milking_session_bulk_litres_not_negative" TO "milking_session_bulk_liters_not_negative";--> statement-breakpoint
ALTER TABLE "milking_session" RENAME COLUMN "sum_bulk_litres" TO "sum_bulk_liters";--> statement-breakpoint
ALTER TABLE "milking_session" RENAME CONSTRAINT "milking_session_sum_bulk_litres_not_negative" TO "milking_session_sum_bulk_liters_not_negative";--> statement-breakpoint
ALTER TABLE "milking_session" RENAME COLUMN "difference_litres" TO "difference_liters";--> statement-breakpoint
ALTER TABLE "shed_phone" RENAME COLUMN "enrolment_code" TO "enrollment_code";--> statement-breakpoint
ALTER TABLE "shed_phone" RENAME COLUMN "enrolment_expires_at" TO "enrollment_expires_at";--> statement-breakpoint
ALTER TABLE "treatment" RENAME COLUMN "learnt_at" TO "learned_at";--> statement-breakpoint
ALTER TABLE "venture" RENAME COLUMN "cancelled_reason" TO "canceled_reason";--> statement-breakpoint
ALTER TABLE "venture" DROP CONSTRAINT "venture_state_known";--> statement-breakpoint
UPDATE "venture" SET "state" = 'canceled' WHERE "state" = 'cancelled';--> statement-breakpoint
ALTER TABLE "venture" ADD CONSTRAINT "venture_state_known" CHECK ("state" IN ('open', 'buying', 'fattening', 'selling', 'settled', 'canceled'));--> statement-breakpoint
ALTER TABLE "sale" DROP CONSTRAINT "sale_venture_state_before_known";--> statement-breakpoint
UPDATE "sale" SET "venture_state_before" = 'canceled' WHERE "venture_state_before" = 'cancelled';--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_venture_state_before_known" CHECK ("venture_state_before" IN ('open', 'buying', 'fattening', 'selling', 'settled', 'canceled'));--> statement-breakpoint
ALTER TABLE "venture_plan" DROP CONSTRAINT "venture_plan_made_while_known";--> statement-breakpoint
UPDATE "venture_plan" SET "made_while" = 'canceled' WHERE "made_while" = 'cancelled';--> statement-breakpoint
ALTER TABLE "venture_plan" ADD CONSTRAINT "venture_plan_made_while_known" CHECK ("made_while" IN ('open', 'buying', 'fattening', 'selling', 'settled', 'canceled'));--> statement-breakpoint
ALTER TABLE "request_to_join" DROP CONSTRAINT "request_to_join_closed_because_known";--> statement-breakpoint
UPDATE "request_to_join" SET "closed_because" = 'venture_canceled' WHERE "closed_because" = 'venture_cancelled';--> statement-breakpoint
ALTER TABLE "request_to_join" ADD CONSTRAINT "request_to_join_closed_because_known" CHECK ("closed_because" IN ('venture_buying', 'venture_canceled', 'taken_out_of_portal', 'investor_retired'));--> statement-breakpoint
ALTER TABLE "pay_in_note" DROP CONSTRAINT "pay_in_note_way_known";--> statement-breakpoint
UPDATE "pay_in_note" SET "way" = 'check' WHERE "way" = 'cheque';--> statement-breakpoint
ALTER TABLE "pay_in_note" ADD CONSTRAINT "pay_in_note_way_known" CHECK ("way" IN ('bank_transfer', 'check', 'deposit_slip', 'mobile_money'));--> statement-breakpoint
ALTER TABLE "pay_in_note_change" DROP CONSTRAINT "pay_in_note_change_way_known";--> statement-breakpoint
UPDATE "pay_in_note_change" SET "way" = 'check' WHERE "way" = 'cheque';--> statement-breakpoint
ALTER TABLE "pay_in_note_change" ADD CONSTRAINT "pay_in_note_change_way_known" CHECK ("way" IN ('bank_transfer', 'check', 'deposit_slip', 'mobile_money'));--> statement-breakpoint
ALTER TABLE "feed_item" DROP CONSTRAINT "feed_item_unit_known";--> statement-breakpoint
UPDATE "feed_item" SET "unit" = 'liter' WHERE "unit" = 'litre';--> statement-breakpoint
ALTER TABLE "feed_item" ADD CONSTRAINT "feed_item_unit_known" CHECK ("unit" IN ('kg', 'liter', 'bundle'));--> statement-breakpoint
UPDATE "alert" SET "params" = ("params" - 'litres') || jsonb_build_object('liters', "params"->'litres') WHERE "params" ? 'litres';--> statement-breakpoint
UPDATE "alert" SET "params" = jsonb_set("params", '{way}', '"check"') WHERE "params"->>'way' = 'cheque';--> statement-breakpoint
UPDATE "drug_product" SET "name_en" = 'Hemorrhagic septicemia (HS) vaccine' WHERE "name_en" = 'Haemorrhagic septicaemia (HS) vaccine';--> statement-breakpoint
UPDATE "notifiable_disease" SET "name_en" = 'Hemorrhagic septicemia' WHERE "name_en" = 'Haemorrhagic septicaemia';
