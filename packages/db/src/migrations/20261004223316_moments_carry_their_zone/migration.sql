-- Every moment the farm keeps was written as its UTC wall clock into a column without its zone, read right only while
-- each session was set to UTC. Each column now carries its zone: what was written is read as the UTC it always was, so
-- not one moment moves, and a console session, psql or a restore drill in any zone reads it as the instant it is.
--
-- One ALTER per table, so each table is rewritten once rather than once a column.

ALTER TABLE "alert"
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "dismissed_at" SET DATA TYPE timestamp with time zone USING "dismissed_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "carried_at" SET DATA TYPE timestamp with time zone USING "carried_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "text_message"
  ALTER COLUMN "sent_at" SET DATA TYPE timestamp with time zone USING "sent_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "audit_event"
  ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone USING "recorded_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "received_at" SET DATA TYPE timestamp with time zone USING "received_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "account"
  ALTER COLUMN "access_token_expires_at" SET DATA TYPE timestamp with time zone USING "access_token_expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "refresh_token_expires_at" SET DATA TYPE timestamp with time zone USING "refresh_token_expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "session"
  ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "user"
  ALTER COLUMN "disabled_at" SET DATA TYPE timestamp with time zone USING "disabled_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "verification"
  ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "backup_run"
  ALTER COLUMN "started_at" SET DATA TYPE timestamp with time zone USING "started_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "finished_at" SET DATA TYPE timestamp with time zone USING "finished_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "abortion"
  ALTER COLUMN "aborted_at" SET DATA TYPE timestamp with time zone USING "aborted_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "expected_calving_at" SET DATA TYPE timestamp with time zone USING "expected_calving_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone USING "recorded_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "calving"
  ALTER COLUMN "calved_at" SET DATA TYPE timestamp with time zone USING "calved_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "dry_off"
  ALTER COLUMN "lactation_started_at" SET DATA TYPE timestamp with time zone USING "lactation_started_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "dried_at" SET DATA TYPE timestamp with time zone USING "dried_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "pregnancy_check"
  ALTER COLUMN "checked_at" SET DATA TYPE timestamp with time zone USING "checked_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "repeat_breeder_answer"
  ALTER COLUMN "answered_at" SET DATA TYPE timestamp with time zone USING "answered_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "service"
  ALTER COLUMN "served_at" SET DATA TYPE timestamp with time zone USING "served_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "weaning"
  ALTER COLUMN "weaned_at" SET DATA TYPE timestamp with time zone USING "weaned_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "device_switch"
  ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "shed_phone"
  ALTER COLUMN "enrolment_expires_at" SET DATA TYPE timestamp with time zone USING "enrolment_expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "claimed_at" SET DATA TYPE timestamp with time zone USING "claimed_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "last_seen_at" SET DATA TYPE timestamp with time zone USING "last_seen_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "revoked_at" SET DATA TYPE timestamp with time zone USING "revoked_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "staff_pin"
  ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "farm"
  ALTER COLUMN "registration_issued_on" SET DATA TYPE timestamp with time zone USING "registration_issued_on" AT TIME ZONE 'UTC',
  ALTER COLUMN "registration_expires_on" SET DATA TYPE timestamp with time zone USING "registration_expires_on" AT TIME ZONE 'UTC',
  ALTER COLUMN "market_price_set_at" SET DATA TYPE timestamp with time zone USING "market_price_set_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "alerts_swept_from" SET DATA TYPE timestamp with time zone USING "alerts_swept_from" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "financial_year_change"
  ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone USING "recorded_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "withdrawn_at" SET DATA TYPE timestamp with time zone USING "withdrawn_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "invite"
  ALTER COLUMN "approved_at" SET DATA TYPE timestamp with time zone USING "approved_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "accepted_at" SET DATA TYPE timestamp with time zone USING "accepted_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "access_until" SET DATA TYPE timestamp with time zone USING "access_until" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "password_code"
  ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "used_at" SET DATA TYPE timestamp with time zone USING "used_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "registration_certificate"
  ALTER COLUMN "taken_at" SET DATA TYPE timestamp with time zone USING "taken_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "registration_renewal"
  ALTER COLUMN "previous_expires_on" SET DATA TYPE timestamp with time zone USING "previous_expires_on" AT TIME ZONE 'UTC',
  ALTER COLUMN "expires_on" SET DATA TYPE timestamp with time zone USING "expires_on" AT TIME ZONE 'UTC',
  ALTER COLUMN "renewed_at" SET DATA TYPE timestamp with time zone USING "renewed_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "role_assignment"
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "revoked_at" SET DATA TYPE timestamp with time zone USING "revoked_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "counterparty"
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "eid_announcement"
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "fattening_joining"
  ALTER COLUMN "joined_at" SET DATA TYPE timestamp with time zone USING "joined_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "priced_at" SET DATA TYPE timestamp with time zone USING "priced_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "intake"
  ALTER COLUMN "arrived_at" SET DATA TYPE timestamp with time zone USING "arrived_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "internal_sale"
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "ready_set_aside"
  ALTER COLUMN "set_aside_at" SET DATA TYPE timestamp with time zone USING "set_aside_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "sale"
  ALTER COLUMN "sold_at" SET DATA TYPE timestamp with time zone USING "sold_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "weigh_in"
  ALTER COLUMN "weighed_at" SET DATA TYPE timestamp with time zone USING "weighed_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "feed_in"
  ALTER COLUMN "received_on" SET DATA TYPE timestamp with time zone USING "received_on" AT TIME ZONE 'UTC',
  ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone USING "recorded_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "feed_item"
  ALTER COLUMN "retired_at" SET DATA TYPE timestamp with time zone USING "retired_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "feeding"
  ALTER COLUMN "flagged_at" SET DATA TYPE timestamp with time zone USING "flagged_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "fed_at" SET DATA TYPE timestamp with time zone USING "fed_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone USING "recorded_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "pen_ration"
  ALTER COLUMN "assigned_at" SET DATA TYPE timestamp with time zone USING "assigned_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "ration"
  ALTER COLUMN "retired_at" SET DATA TYPE timestamp with time zone USING "retired_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "ration_version"
  ALTER COLUMN "published_at" SET DATA TYPE timestamp with time zone USING "published_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "stock_count"
  ALTER COLUMN "counted_at" SET DATA TYPE timestamp with time zone USING "counted_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone USING "recorded_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "campaign_lot_number"
  ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone USING "recorded_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "diagnosis"
  ALTER COLUMN "diagnosed_at" SET DATA TYPE timestamp with time zone USING "diagnosed_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone USING "recorded_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "closed_at" SET DATA TYPE timestamp with time zone USING "closed_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "dls_report"
  ALTER COLUMN "delivered_at" SET DATA TYPE timestamp with time zone USING "delivered_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "withdrawn_at" SET DATA TYPE timestamp with time zone USING "withdrawn_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "drug_product"
  ALTER COLUMN "days_set_at" SET DATA TYPE timestamp with time zone USING "days_set_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "retired_at" SET DATA TYPE timestamp with time zone USING "retired_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "excused_dose"
  ALTER COLUMN "excused_at" SET DATA TYPE timestamp with time zone USING "excused_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "medicine_count"
  ALTER COLUMN "counted_at" SET DATA TYPE timestamp with time zone USING "counted_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone USING "recorded_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "notifiable_disease"
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "retired_at" SET DATA TYPE timestamp with time zone USING "retired_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "prescription"
  ALTER COLUMN "prescribed_at" SET DATA TYPE timestamp with time zone USING "prescribed_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone USING "recorded_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "treatment"
  ALTER COLUMN "due_at" SET DATA TYPE timestamp with time zone USING "due_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "given_at" SET DATA TYPE timestamp with time zone USING "given_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "vet_case"
  ALTER COLUMN "opened_at" SET DATA TYPE timestamp with time zone USING "opened_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "closed_at" SET DATA TYPE timestamp with time zone USING "closed_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "animal"
  ALTER COLUMN "birth_date" SET DATA TYPE timestamp with time zone USING "birth_date" AT TIME ZONE 'UTC',
  ALTER COLUMN "photo_updated_at" SET DATA TYPE timestamp with time zone USING "photo_updated_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "lactation_started_at" SET DATA TYPE timestamp with time zone USING "lactation_started_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "expected_calving_at" SET DATA TYPE timestamp with time zone USING "expected_calving_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "milk_withdrawal_until" SET DATA TYPE timestamp with time zone USING "milk_withdrawal_until" AT TIME ZONE 'UTC',
  ALTER COLUMN "meat_withdrawal_until" SET DATA TYPE timestamp with time zone USING "meat_withdrawal_until" AT TIME ZONE 'UTC',
  ALTER COLUMN "milk_withdrawal_from_doses" SET DATA TYPE timestamp with time zone USING "milk_withdrawal_from_doses" AT TIME ZONE 'UTC',
  ALTER COLUMN "meat_withdrawal_from_doses" SET DATA TYPE timestamp with time zone USING "meat_withdrawal_from_doses" AT TIME ZONE 'UTC',
  ALTER COLUMN "withdrawal_shortened_at" SET DATA TYPE timestamp with time zone USING "withdrawal_shortened_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "state_changed_at" SET DATA TYPE timestamp with time zone USING "state_changed_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "animal_move"
  ALTER COLUMN "moved_at" SET DATA TYPE timestamp with time zone USING "moved_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "animal_photo"
  ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "breed"
  ALTER COLUMN "retired_at" SET DATA TYPE timestamp with time zone USING "retired_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "mortality"
  ALTER COLUMN "happened_at" SET DATA TYPE timestamp with time zone USING "happened_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone USING "recorded_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "mortality_photo"
  ALTER COLUMN "taken_at" SET DATA TYPE timestamp with time zone USING "taken_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "replaced_at" SET DATA TYPE timestamp with time zone USING "replaced_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "pen"
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "pen_assignment"
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "ended_at" SET DATA TYPE timestamp with time zone USING "ended_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "retag"
  ALTER COLUMN "retagged_at" SET DATA TYPE timestamp with time zone USING "retagged_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "shed"
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "completion_photo"
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "sop_instance"
  ALTER COLUMN "due_at" SET DATA TYPE timestamp with time zone USING "due_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "claimed_at" SET DATA TYPE timestamp with time zone USING "claimed_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "completed_at" SET DATA TYPE timestamp with time zone USING "completed_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "step_completion"
  ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone USING "recorded_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "received_at" SET DATA TYPE timestamp with time zone USING "received_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "dispatch"
  ALTER COLUMN "dispatched_at" SET DATA TYPE timestamp with time zone USING "dispatched_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone USING "recorded_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "milk_record"
  ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone USING "recorded_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "milking_session"
  ALTER COLUMN "due_at" SET DATA TYPE timestamp with time zone USING "due_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "flagged_at" SET DATA TYPE timestamp with time zone USING "flagged_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "cash_count"
  ALTER COLUMN "counted_at" SET DATA TYPE timestamp with time zone USING "counted_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone USING "recorded_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "head_count"
  ALTER COLUMN "counted_at" SET DATA TYPE timestamp with time zone USING "counted_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone USING "recorded_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "missing"
  ALTER COLUMN "since" SET DATA TYPE timestamp with time zone USING "since" AT TIME ZONE 'UTC',
  ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone USING "recorded_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "found_at" SET DATA TYPE timestamp with time zone USING "found_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "written_off_at" SET DATA TYPE timestamp with time zone USING "written_off_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "state_changed_before" SET DATA TYPE timestamp with time zone USING "state_changed_before" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "farm_account"
  ALTER COLUMN "retired_at" SET DATA TYPE timestamp with time zone USING "retired_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "farm_account_check"
  ALTER COLUMN "checked_at" SET DATA TYPE timestamp with time zone USING "checked_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "handover"
  ALTER COLUMN "handed_at" SET DATA TYPE timestamp with time zone USING "handed_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone USING "recorded_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "medicine_purchase"
  ALTER COLUMN "purchased_on" SET DATA TYPE timestamp with time zone USING "purchased_on" AT TIME ZONE 'UTC',
  ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone USING "recorded_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "money_category"
  ALTER COLUMN "paid_monthly_since" SET DATA TYPE timestamp with time zone USING "paid_monthly_since" AT TIME ZONE 'UTC',
  ALTER COLUMN "retired_at" SET DATA TYPE timestamp with time zone USING "retired_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "money_event"
  ALTER COLUMN "occurred_at" SET DATA TYPE timestamp with time zone USING "occurred_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "approved_at" SET DATA TYPE timestamp with time zone USING "approved_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone USING "recorded_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "money_receipt"
  ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "receivable_payment"
  ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone USING "recorded_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "receivable_write_off"
  ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone USING "recorded_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "vet_fee"
  ALTER COLUMN "visited_on" SET DATA TYPE timestamp with time zone USING "visited_on" AT TIME ZONE 'UTC',
  ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone USING "recorded_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "wage_draw"
  ALTER COLUMN "drawn_at" SET DATA TYPE timestamp with time zone USING "drawn_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone USING "recorded_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "observation"
  ALTER COLUMN "seen_at" SET DATA TYPE timestamp with time zone USING "seen_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "withdrawn_at" SET DATA TYPE timestamp with time zone USING "withdrawn_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone USING "recorded_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "paper_template"
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "paper_template_version"
  ALTER COLUMN "published_at" SET DATA TYPE timestamp with time zone USING "published_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "push_subscription"
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "revoked_at" SET DATA TYPE timestamp with time zone USING "revoked_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "bank_rate"
  ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone USING "recorded_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "dairy_entry_price"
  ALTER COLUMN "set_at" SET DATA TYPE timestamp with time zone USING "set_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "head_price"
  ALTER COLUMN "set_at" SET DATA TYPE timestamp with time zone USING "set_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "needs_review"
  ALTER COLUMN "raised_at" SET DATA TYPE timestamp with time zone USING "raised_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "resolved_at" SET DATA TYPE timestamp with time zone USING "resolved_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "scheduler_state"
  ALTER COLUMN "last_ran_at" SET DATA TYPE timestamp with time zone USING "last_ran_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "last_ok_at" SET DATA TYPE timestamp with time zone USING "last_ok_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "sop_definition"
  ALTER COLUMN "retired_at" SET DATA TYPE timestamp with time zone USING "retired_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "sop_proposal"
  ALTER COLUMN "decided_at" SET DATA TYPE timestamp with time zone USING "decided_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "sop_training"
  ALTER COLUMN "trained_at" SET DATA TYPE timestamp with time zone USING "trained_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "sop_version"
  ALTER COLUMN "published_at" SET DATA TYPE timestamp with time zone USING "published_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "sync_batch"
  ALTER COLUMN "received_at" SET DATA TYPE timestamp with time zone USING "received_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "sync_entry"
  ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone USING "recorded_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "received_at" SET DATA TYPE timestamp with time zone USING "received_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "buying_trip"
  ALTER COLUMN "went_on" SET DATA TYPE timestamp with time zone USING "went_on" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "float_reconciled_at" SET DATA TYPE timestamp with time zone USING "float_reconciled_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "selling_trip"
  ALTER COLUMN "went_on" SET DATA TYPE timestamp with time zone USING "went_on" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "agreement_amendment"
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "agreement_offer"
  ALTER COLUMN "offered_at" SET DATA TYPE timestamp with time zone USING "offered_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "agreed_at" SET DATA TYPE timestamp with time zone USING "agreed_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "withdrawn_at" SET DATA TYPE timestamp with time zone USING "withdrawn_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "approved_at" SET DATA TYPE timestamp with time zone USING "approved_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "agreement_paper"
  ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "amendment_offer"
  ALTER COLUMN "offered_at" SET DATA TYPE timestamp with time zone USING "offered_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "withdrawn_at" SET DATA TYPE timestamp with time zone USING "withdrawn_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "approved_at" SET DATA TYPE timestamp with time zone USING "approved_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "amendment_offer_answer"
  ALTER COLUMN "agreed_at" SET DATA TYPE timestamp with time zone USING "agreed_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "amendment_paper"
  ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "investment_agreement"
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "investor"
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "retired_at" SET DATA TYPE timestamp with time zone USING "retired_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "investor_access"
  ALTER COLUMN "code_expires_at" SET DATA TYPE timestamp with time zone USING "code_expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "invited_at" SET DATA TYPE timestamp with time zone USING "invited_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "accepted_at" SET DATA TYPE timestamp with time zone USING "accepted_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "revoked_at" SET DATA TYPE timestamp with time zone USING "revoked_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "last_seen_at" SET DATA TYPE timestamp with time zone USING "last_seen_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "offers_seen_at" SET DATA TYPE timestamp with time zone USING "offers_seen_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "nomination"
  ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone USING "recorded_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "nomination_paper"
  ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "portal_consent"
  ALTER COLUMN "signed_on" SET DATA TYPE timestamp with time zone USING "signed_on" AT TIME ZONE 'UTC',
  ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone USING "recorded_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "withdrawn_on" SET DATA TYPE timestamp with time zone USING "withdrawn_on" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "request_to_join"
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "answered_at" SET DATA TYPE timestamp with time zone USING "answered_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "closed_at" SET DATA TYPE timestamp with time zone USING "closed_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "request_to_join_change"
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "venture"
  ALTER COLUMN "shown_in_portal_at" SET DATA TYPE timestamp with time zone USING "shown_in_portal_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "venture_plan"
  ALTER COLUMN "made_at" SET DATA TYPE timestamp with time zone USING "made_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "venture_settlement_adjustment"
  ALTER COLUMN "closed_at" SET DATA TYPE timestamp with time zone USING "closed_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "raised_at" SET DATA TYPE timestamp with time zone USING "raised_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "venture_bank_check"
  ALTER COLUMN "checked_at" SET DATA TYPE timestamp with time zone USING "checked_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "venture_movement"
  ALTER COLUMN "reconciled_at" SET DATA TYPE timestamp with time zone USING "reconciled_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "venture_settlement"
  ALTER COLUMN "approved_at" SET DATA TYPE timestamp with time zone USING "approved_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "venture_settlement_share"
  ALTER COLUMN "acknowledged_at" SET DATA TYPE timestamp with time zone USING "acknowledged_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
