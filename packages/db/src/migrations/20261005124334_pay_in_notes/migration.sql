CREATE TABLE "pay_in_note" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"venture_id" text NOT NULL,
	"agreement_id" text NOT NULL,
	"investor_id" text NOT NULL,
	"amount_money" numeric(12,2) NOT NULL,
	"sent_on" text NOT NULL,
	"way" text NOT NULL,
	"reference" text NOT NULL,
	"state" text DEFAULT 'waiting' NOT NULL,
	"sent_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"movement_id" text,
	"answer_line" text,
	"answered_by" text,
	"answered_at" timestamp with time zone,
	"closed_because" text,
	"closed_at" timestamp with time zone,
	CONSTRAINT "pay_in_note_sent_on_day" CHECK ("sent_on" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
	CONSTRAINT "pay_in_note_amount_above_nothing" CHECK ("amount_money" > 0)
);
--> statement-breakpoint
CREATE TABLE "pay_in_note_change" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"note_id" text NOT NULL,
	"kind" text NOT NULL,
	"amount_money" numeric(12,2) NOT NULL,
	"sent_on" text NOT NULL,
	"way" text NOT NULL,
	"reference" text NOT NULL,
	"made_by" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pay_in_note_photo" (
	"note_id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"content_type" text NOT NULL,
	"data" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "pay_in_note_venture_idx" ON "pay_in_note" ("farm_id","venture_id");--> statement-breakpoint
CREATE INDEX "pay_in_note_agreement_idx" ON "pay_in_note" ("agreement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pay_in_note_movement_uidx" ON "pay_in_note" ("movement_id") WHERE "movement_id" is not null;--> statement-breakpoint
CREATE INDEX "pay_in_note_change_idx" ON "pay_in_note_change" ("farm_id","note_id");--> statement-breakpoint
ALTER TABLE "pay_in_note" ADD CONSTRAINT "pay_in_note_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pay_in_note" ADD CONSTRAINT "pay_in_note_venture_id_venture_id_fkey" FOREIGN KEY ("venture_id") REFERENCES "venture"("id");--> statement-breakpoint
ALTER TABLE "pay_in_note" ADD CONSTRAINT "pay_in_note_agreement_id_investment_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "investment_agreement"("id");--> statement-breakpoint
ALTER TABLE "pay_in_note" ADD CONSTRAINT "pay_in_note_investor_id_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investor"("id");--> statement-breakpoint
ALTER TABLE "pay_in_note" ADD CONSTRAINT "pay_in_note_sent_by_user_id_fkey" FOREIGN KEY ("sent_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "pay_in_note" ADD CONSTRAINT "pay_in_note_movement_id_venture_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "venture_movement"("id");--> statement-breakpoint
ALTER TABLE "pay_in_note" ADD CONSTRAINT "pay_in_note_answered_by_user_id_fkey" FOREIGN KEY ("answered_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "pay_in_note_change" ADD CONSTRAINT "pay_in_note_change_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pay_in_note_change" ADD CONSTRAINT "pay_in_note_change_note_id_pay_in_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "pay_in_note"("id");--> statement-breakpoint
ALTER TABLE "pay_in_note_change" ADD CONSTRAINT "pay_in_note_change_made_by_user_id_fkey" FOREIGN KEY ("made_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "pay_in_note_photo" ADD CONSTRAINT "pay_in_note_photo_note_id_pay_in_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "pay_in_note"("id");--> statement-breakpoint
ALTER TABLE "pay_in_note_photo" ADD CONSTRAINT "pay_in_note_photo_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "pay_in_note" ADD CONSTRAINT "pay_in_note_way_known" CHECK ("way" IN ('bank_transfer', 'cheque', 'deposit_slip', 'mobile_money'));--> statement-breakpoint
ALTER TABLE "pay_in_note" ADD CONSTRAINT "pay_in_note_state_known" CHECK ("state" IN ('waiting', 'received', 'not_found', 'withdrawn', 'closed'));--> statement-breakpoint
ALTER TABLE "pay_in_note" ADD CONSTRAINT "pay_in_note_closed_because_known" CHECK ("closed_because" IN ('nothing_owed', 'venture_takes_no_capital', 'investor_retired'));--> statement-breakpoint
ALTER TABLE "pay_in_note" ADD CONSTRAINT "pay_in_note_amount_money_not_negative" CHECK ("amount_money" >= 0);--> statement-breakpoint
ALTER TABLE "pay_in_note_change" ADD CONSTRAINT "pay_in_note_change_kind_known" CHECK ("kind" IN ('sent', 'changed', 'withdrawn'));--> statement-breakpoint
ALTER TABLE "pay_in_note_change" ADD CONSTRAINT "pay_in_note_change_way_known" CHECK ("way" IN ('bank_transfer', 'cheque', 'deposit_slip', 'mobile_money'));--> statement-breakpoint
ALTER TABLE "pay_in_note_change" ADD CONSTRAINT "pay_in_note_change_amount_money_not_negative" CHECK ("amount_money" >= 0);--> statement-breakpoint
ALTER TABLE "alert" DROP CONSTRAINT "alert_kind_known";--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_kind_known" CHECK ("kind" IN ('instance_overdue', 'instance_escalated', 'instance_sent_back', 'needs_review', 'sop_published', 'sop_proposed', 'sop_retired', 'sop_restored', 'withdrawal_ending', 'notifiable_diagnosis', 'entry_rejected', 'withdrawal_changed', 'low_stock', 'money_awaiting_approval', 'registration_renewal_due', 'investor_statement_due', 'reimbursement_due', 'day_not_turning', 'backup_overdue', 'lot_expiring', 'lot_expired', 'medicine_low_stock', 'expired_dose_given', 'join_requested', 'receivable_overdue', 'animal_missing', 'store_shortfall', 'pen_sores_seen', 'milk_unaccounted', 'head_count_differs', 'dose_not_prescribed', 'entered_twice', 'sold_under_cost', 'still_here_after_eid', 'medicine_short', 'feed_price_jump', 'settings_changed', 'cash_short', 'arrival_weight_short', 'large_shrink', 'mortality_recorded', 'mortality_undiagnosed', 'monthly_sum_missed', 'pay_in_note_sent'));--> statement-breakpoint
ALTER TABLE "text_message" DROP CONSTRAINT "text_message_kind_known";--> statement-breakpoint
ALTER TABLE "text_message" ADD CONSTRAINT "text_message_kind_known" CHECK ("kind" IN ('instance_overdue', 'instance_escalated', 'instance_sent_back', 'needs_review', 'sop_published', 'sop_proposed', 'sop_retired', 'sop_restored', 'withdrawal_ending', 'notifiable_diagnosis', 'entry_rejected', 'withdrawal_changed', 'low_stock', 'money_awaiting_approval', 'registration_renewal_due', 'investor_statement_due', 'reimbursement_due', 'day_not_turning', 'backup_overdue', 'lot_expiring', 'lot_expired', 'medicine_low_stock', 'expired_dose_given', 'join_requested', 'receivable_overdue', 'animal_missing', 'store_shortfall', 'pen_sores_seen', 'milk_unaccounted', 'head_count_differs', 'dose_not_prescribed', 'entered_twice', 'sold_under_cost', 'still_here_after_eid', 'medicine_short', 'feed_price_jump', 'settings_changed', 'cash_short', 'arrival_weight_short', 'large_shrink', 'mortality_recorded', 'mortality_undiagnosed', 'monthly_sum_missed', 'pay_in_note_sent'));
