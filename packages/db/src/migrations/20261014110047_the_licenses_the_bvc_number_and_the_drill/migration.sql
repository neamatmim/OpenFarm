-- The farm's Licenses beside its Registration, the Vet's BVC number, the Restore Drill written down, and two notices:
-- a License coming up for renewal (license_renewal_due) and the drill overdue (restore_drill_overdue).
CREATE TABLE "restore_drill" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"done_on" timestamp with time zone NOT NULL,
	"went_well" boolean NOT NULL,
	"backup_used" text,
	"note" text,
	"done_by" text NOT NULL,
	"recorded_by" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "farm_license" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text,
	"number" text NOT NULL,
	"issuer" text,
	"issued_on" timestamp with time zone,
	"expires_on" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "license_certificate" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"license_id" text NOT NULL,
	"content_type" text NOT NULL,
	"data" text NOT NULL,
	"completion_id" text,
	"taken_by" text,
	"taken_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "license_renewal" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"license_id" text NOT NULL,
	"completion_id" text NOT NULL,
	"previous_expires_on" timestamp with time zone,
	"expires_on" timestamp with time zone NOT NULL,
	"renewed_by" text,
	"renewed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "role_assignment" ADD COLUMN "bvc_number" text;--> statement-breakpoint
CREATE INDEX "restore_drill_farm_idx" ON "restore_drill" ("farm_id","done_on");--> statement-breakpoint
CREATE INDEX "farm_license_farm_idx" ON "farm_license" ("farm_id");--> statement-breakpoint
CREATE INDEX "license_certificate_license_idx" ON "license_certificate" ("license_id","taken_at");--> statement-breakpoint
CREATE UNIQUE INDEX "license_certificate_completion_uidx" ON "license_certificate" ("completion_id") WHERE "completion_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "license_renewal_completion_uidx" ON "license_renewal" ("completion_id");--> statement-breakpoint
ALTER TABLE "restore_drill" ADD CONSTRAINT "restore_drill_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "restore_drill" ADD CONSTRAINT "restore_drill_done_by_user_id_fkey" FOREIGN KEY ("done_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "restore_drill" ADD CONSTRAINT "restore_drill_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "farm_license" ADD CONSTRAINT "farm_license_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "farm_license" ADD CONSTRAINT "farm_license_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "license_certificate" ADD CONSTRAINT "license_certificate_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "license_certificate" ADD CONSTRAINT "license_certificate_license_id_farm_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "farm_license"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "license_certificate" ADD CONSTRAINT "license_certificate_taken_by_user_id_fkey" FOREIGN KEY ("taken_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "license_renewal" ADD CONSTRAINT "license_renewal_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "license_renewal" ADD CONSTRAINT "license_renewal_license_id_farm_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "farm_license"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "license_renewal" ADD CONSTRAINT "license_renewal_renewed_by_user_id_fkey" FOREIGN KEY ("renewed_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "farm_license" ADD CONSTRAINT "farm_license_kind_known" CHECK ("kind" IN ('trade', 'environment', 'fire', 'other'));--> statement-breakpoint
ALTER TABLE "alert" DROP CONSTRAINT "alert_kind_known";--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_kind_known" CHECK ("kind" IN ('instance_overdue', 'instance_escalated', 'instance_sent_back', 'needs_review', 'sop_published', 'sop_proposed', 'sop_retired', 'sop_restored', 'withdrawal_ending', 'notifiable_diagnosis', 'entry_rejected', 'withdrawal_changed', 'low_stock', 'money_awaiting_approval', 'registration_renewal_due', 'investor_statement_due', 'reimbursement_due', 'day_not_turning', 'backup_overdue', 'server_failing', 'lot_expiring', 'lot_expired', 'medicine_low_stock', 'expired_dose_given', 'join_requested', 'receivable_overdue', 'animal_missing', 'store_shortfall', 'pen_sores_seen', 'milk_unaccounted', 'head_count_differs', 'dose_not_prescribed', 'entered_twice', 'sold_under_cost', 'still_here_after_eid', 'medicine_short', 'feed_price_jump', 'settings_changed', 'cash_short', 'arrival_weight_short', 'large_shrink', 'mortality_recorded', 'mortality_undiagnosed', 'monthly_sum_missed', 'pay_in_note_sent', 'credit_after_write_off', 'password_guessed', 'monthly_copy_failed', 'work_missed', 'taken_back', 'proposal_answered', 'unwell_urgent', 'offer_agreed', 'license_renewal_due', 'restore_drill_overdue'));--> statement-breakpoint
ALTER TABLE "text_message" DROP CONSTRAINT "text_message_kind_known";--> statement-breakpoint
ALTER TABLE "text_message" ADD CONSTRAINT "text_message_kind_known" CHECK ("kind" IN ('instance_overdue', 'instance_escalated', 'instance_sent_back', 'needs_review', 'sop_published', 'sop_proposed', 'sop_retired', 'sop_restored', 'withdrawal_ending', 'notifiable_diagnosis', 'entry_rejected', 'withdrawal_changed', 'low_stock', 'money_awaiting_approval', 'registration_renewal_due', 'investor_statement_due', 'reimbursement_due', 'day_not_turning', 'backup_overdue', 'server_failing', 'lot_expiring', 'lot_expired', 'medicine_low_stock', 'expired_dose_given', 'join_requested', 'receivable_overdue', 'animal_missing', 'store_shortfall', 'pen_sores_seen', 'milk_unaccounted', 'head_count_differs', 'dose_not_prescribed', 'entered_twice', 'sold_under_cost', 'still_here_after_eid', 'medicine_short', 'feed_price_jump', 'settings_changed', 'cash_short', 'arrival_weight_short', 'large_shrink', 'mortality_recorded', 'mortality_undiagnosed', 'monthly_sum_missed', 'pay_in_note_sent', 'credit_after_write_off', 'password_guessed', 'monthly_copy_failed', 'work_missed', 'taken_back', 'proposal_answered', 'unwell_urgent', 'offer_agreed', 'license_renewal_due', 'restore_drill_overdue'));
