CREATE TABLE "application_code" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"link_id" text NOT NULL,
	"purpose" text NOT NULL,
	"code_hash" text NOT NULL,
	"sent_to" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "investor_application" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"link_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"address" text,
	"nid" text,
	"bank_account" text,
	"trade_license" text,
	"rjsc_number" text,
	"tin" text,
	"authority" text,
	"authority_on" text,
	"signatory_name" text,
	"signatory_nid" text,
	"signatory_role" text,
	"nominees" jsonb,
	"language" text NOT NULL,
	"consent_version_id" text NOT NULL,
	"consent_paper" jsonb,
	"consent_paper_hash" text NOT NULL,
	"code_sent_to" text NOT NULL,
	"code_sent_at" timestamp with time zone NOT NULL,
	"caller_address" text,
	"caller_agent" text,
	"sent_at" timestamp with time zone NOT NULL,
	"state" text DEFAULT 'waiting' NOT NULL,
	"answered_at" timestamp with time zone,
	"answered_by" text,
	"answer_line" text,
	"investor_id" text,
	"cleared_at" timestamp with time zone,
	CONSTRAINT "investor_application_authority_on_day" CHECK ("authority_on" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
	CONSTRAINT "investor_application_approved_names_investor" CHECK (("state" = 'approved') = ("investor_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "investor_application_photo" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"application_id" text NOT NULL,
	"what" text NOT NULL,
	"content_type" text NOT NULL,
	"data" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_link" ADD COLUMN "open_key_hash" text;--> statement-breakpoint
ALTER TABLE "application_link" ADD COLUMN "open_key_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "application_link" ADD COLUMN "opened_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "application_code_link_purpose_uidx" ON "application_code" ("link_id","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "investor_application_link_uidx" ON "investor_application" ("link_id");--> statement-breakpoint
CREATE INDEX "investor_application_state_idx" ON "investor_application" ("farm_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "investor_application_photo_uidx" ON "investor_application_photo" ("application_id","what");--> statement-breakpoint
ALTER TABLE "application_code" ADD CONSTRAINT "application_code_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "application_code" ADD CONSTRAINT "application_code_link_id_application_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "application_link"("id");--> statement-breakpoint
ALTER TABLE "investor_application" ADD CONSTRAINT "investor_application_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "investor_application" ADD CONSTRAINT "investor_application_link_id_application_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "application_link"("id");--> statement-breakpoint
ALTER TABLE "investor_application" ADD CONSTRAINT "investor_application_FuHhW0R7sA1S_fkey" FOREIGN KEY ("consent_version_id") REFERENCES "paper_template_version"("id");--> statement-breakpoint
ALTER TABLE "investor_application" ADD CONSTRAINT "investor_application_answered_by_user_id_fkey" FOREIGN KEY ("answered_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "investor_application" ADD CONSTRAINT "investor_application_investor_id_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investor"("id");--> statement-breakpoint
ALTER TABLE "investor_application_photo" ADD CONSTRAINT "investor_application_photo_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "investor_application_photo" ADD CONSTRAINT "investor_application_photo_RuEhjejBHEEP_fkey" FOREIGN KEY ("application_id") REFERENCES "investor_application"("id");--> statement-breakpoint
ALTER TABLE "alert" DROP CONSTRAINT "alert_kind_known";--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_kind_known" CHECK ("kind" IN ('instance_overdue', 'instance_escalated', 'instance_sent_back', 'needs_review', 'sop_published', 'sop_proposed', 'sop_retired', 'sop_restored', 'withdrawal_ending', 'notifiable_diagnosis', 'entry_rejected', 'withdrawal_changed', 'low_stock', 'money_awaiting_approval', 'registration_renewal_due', 'investor_statement_due', 'reimbursement_due', 'day_not_turning', 'backup_overdue', 'server_failing', 'lot_expiring', 'lot_expired', 'medicine_low_stock', 'expired_dose_given', 'join_requested', 'receivable_overdue', 'animal_missing', 'store_shortfall', 'pen_sores_seen', 'milk_unaccounted', 'head_count_differs', 'dose_not_prescribed', 'entered_twice', 'sold_under_cost', 'still_here_after_eid', 'medicine_short', 'feed_price_jump', 'settings_changed', 'cash_short', 'arrival_weight_short', 'large_shrink', 'mortality_recorded', 'mortality_undiagnosed', 'monthly_sum_missed', 'pay_in_note_sent', 'credit_after_write_off', 'password_guessed', 'monthly_copy_failed', 'work_missed', 'taken_back', 'proposal_answered', 'unwell_urgent', 'offer_agreed', 'license_renewal_due', 'restore_drill_overdue', 'application_sent'));--> statement-breakpoint
ALTER TABLE "text_message" DROP CONSTRAINT "text_message_kind_known";--> statement-breakpoint
ALTER TABLE "text_message" ADD CONSTRAINT "text_message_kind_known" CHECK ("kind" IN ('instance_overdue', 'instance_escalated', 'instance_sent_back', 'needs_review', 'sop_published', 'sop_proposed', 'sop_retired', 'sop_restored', 'withdrawal_ending', 'notifiable_diagnosis', 'entry_rejected', 'withdrawal_changed', 'low_stock', 'money_awaiting_approval', 'registration_renewal_due', 'investor_statement_due', 'reimbursement_due', 'day_not_turning', 'backup_overdue', 'server_failing', 'lot_expiring', 'lot_expired', 'medicine_low_stock', 'expired_dose_given', 'join_requested', 'receivable_overdue', 'animal_missing', 'store_shortfall', 'pen_sores_seen', 'milk_unaccounted', 'head_count_differs', 'dose_not_prescribed', 'entered_twice', 'sold_under_cost', 'still_here_after_eid', 'medicine_short', 'feed_price_jump', 'settings_changed', 'cash_short', 'arrival_weight_short', 'large_shrink', 'mortality_recorded', 'mortality_undiagnosed', 'monthly_sum_missed', 'pay_in_note_sent', 'credit_after_write_off', 'password_guessed', 'monthly_copy_failed', 'work_missed', 'taken_back', 'proposal_answered', 'unwell_urgent', 'offer_agreed', 'license_renewal_due', 'restore_drill_overdue', 'application_sent'));--> statement-breakpoint
ALTER TABLE "application_code" ADD CONSTRAINT "application_code_purpose_known" CHECK ("purpose" IN ('open', 'agree'));--> statement-breakpoint
ALTER TABLE "investor_application" ADD CONSTRAINT "investor_application_kind_known" CHECK ("kind" IN ('person', 'organization'));--> statement-breakpoint
ALTER TABLE "investor_application" ADD CONSTRAINT "investor_application_state_known" CHECK ("state" IN ('waiting', 'approved', 'declined', 'lapsed'));--> statement-breakpoint
ALTER TABLE "investor_application_photo" ADD CONSTRAINT "investor_application_photo_what_known" CHECK ("what" IN ('nid_front', 'nid_back', 'trade_license', 'authority'));