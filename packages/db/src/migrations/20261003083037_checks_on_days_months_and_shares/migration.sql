-- Every check is NOT VALID: it holds for every row written or changed from now on, and a deploy does not stop on a
-- row written before it. VALIDATE CONSTRAINT each once the farm's own data is known to hold them.
ALTER TABLE "intake" ADD CONSTRAINT "intake_window_days" CHECK ("target_window_start" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and "target_window_end" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') NOT VALID;--> statement-breakpoint
ALTER TABLE "intake" ADD CONSTRAINT "intake_window_in_order" CHECK ("target_window_start" <= "target_window_end") NOT VALID;--> statement-breakpoint
ALTER TABLE "farm_account_check" ADD CONSTRAINT "farm_account_check_month" CHECK ("for_month" ~ '^[0-9]{4}-[0-9]{2}$') NOT VALID;--> statement-breakpoint
ALTER TABLE "money_event" ADD CONSTRAINT "money_event_wage_month" CHECK ("wage_month" is null or "wage_month" ~ '^[0-9]{4}-[0-9]{2}$') NOT VALID;--> statement-breakpoint
ALTER TABLE "agreement_amendment" ADD CONSTRAINT "agreement_amendment_window_days" CHECK ("target_window_start" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and "target_window_end" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') NOT VALID;--> statement-breakpoint
ALTER TABLE "agreement_amendment" ADD CONSTRAINT "agreement_amendment_window_in_order" CHECK ("target_window_start" <= "target_window_end") NOT VALID;--> statement-breakpoint
ALTER TABLE "agreement_amendment" ADD CONSTRAINT "agreement_amendment_percent_whole" CHECK ("investors_percent" between 0 and 100) NOT VALID;--> statement-breakpoint
ALTER TABLE "agreement_offer" ADD CONSTRAINT "agreement_offer_percent_whole" CHECK ("investors_percent" between 0 and 100) NOT VALID;--> statement-breakpoint
ALTER TABLE "amendment_offer" ADD CONSTRAINT "amendment_offer_window_days" CHECK ("target_window_start" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and "target_window_end" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') NOT VALID;--> statement-breakpoint
ALTER TABLE "amendment_offer" ADD CONSTRAINT "amendment_offer_window_in_order" CHECK ("target_window_start" <= "target_window_end") NOT VALID;--> statement-breakpoint
ALTER TABLE "amendment_offer" ADD CONSTRAINT "amendment_offer_percent_whole" CHECK ("investors_percent" between 0 and 100) NOT VALID;--> statement-breakpoint
ALTER TABLE "investment_agreement" ADD CONSTRAINT "investment_agreement_window_days" CHECK ("target_window_start" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and "target_window_end" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') NOT VALID;--> statement-breakpoint
ALTER TABLE "investment_agreement" ADD CONSTRAINT "investment_agreement_window_in_order" CHECK ("target_window_start" <= "target_window_end") NOT VALID;--> statement-breakpoint
ALTER TABLE "investment_agreement" ADD CONSTRAINT "investment_agreement_percent_whole" CHECK ("investors_percent" between 0 and 100) NOT VALID;--> statement-breakpoint
ALTER TABLE "nominee" ADD CONSTRAINT "nominee_percent_whole" CHECK ("share_percent" between 0 and 100) NOT VALID;--> statement-breakpoint
ALTER TABLE "venture" ADD CONSTRAINT "venture_window_days" CHECK ("target_window_start" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and "target_window_end" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') NOT VALID;--> statement-breakpoint
ALTER TABLE "venture" ADD CONSTRAINT "venture_window_in_order" CHECK ("target_window_start" <= "target_window_end") NOT VALID;--> statement-breakpoint
ALTER TABLE "venture" ADD CONSTRAINT "venture_floor_within_target" CHECK ("floor_bdt" <= "target_capital_bdt") NOT VALID;--> statement-breakpoint
ALTER TABLE "venture_bank_check" ADD CONSTRAINT "venture_bank_check_month" CHECK ("for_month" ~ '^[0-9]{4}-[0-9]{2}$') NOT VALID;--> statement-breakpoint
ALTER TABLE "venture_movement" ADD CONSTRAINT "venture_movement_month" CHECK ("for_month" is null or "for_month" ~ '^[0-9]{4}-[0-9]{2}$') NOT VALID;