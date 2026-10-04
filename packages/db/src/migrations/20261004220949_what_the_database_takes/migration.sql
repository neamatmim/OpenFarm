-- What the database itself will take, beside what the app checks before it asks:
--
-- * every column the code keeps to a fixed list of words takes only those words, so a status or a kind the money
--   reads is never one nobody wrote a branch for;
-- * every amount, price, weight, litre and count that is never below nothing is held there — profit, a payout,
--   a Settlement's adjustment and the tank's difference may go below and are left free;
-- * the checks added on 2026-10-03 NOT VALID are validated, as every row written before them holds them.
--
-- Each was counted against the dev farm, the seed and a year of padded data first: no row breaks one.

ALTER TABLE "alert" ADD CONSTRAINT "alert_kind_known" CHECK ("kind" IN ('instance_overdue', 'instance_escalated', 'instance_sent_back', 'needs_review', 'sop_published', 'sop_proposed', 'sop_retired', 'sop_restored', 'withdrawal_ending', 'notifiable_diagnosis', 'entry_rejected', 'withdrawal_changed', 'low_stock', 'money_awaiting_approval', 'registration_renewal_due', 'investor_statement_due', 'reimbursement_due', 'day_not_turning', 'backup_overdue', 'lot_expiring', 'lot_expired', 'medicine_low_stock', 'expired_dose_given', 'join_requested', 'receivable_overdue', 'animal_missing', 'store_shortfall', 'pen_sores_seen', 'milk_unaccounted', 'head_count_differs', 'dose_not_prescribed', 'entered_twice', 'sold_under_cost', 'still_here_after_eid', 'medicine_short', 'feed_price_jump', 'settings_changed', 'cash_short', 'arrival_weight_short', 'large_shrink', 'mortality_recorded', 'mortality_undiagnosed', 'monthly_sum_missed'));--> statement-breakpoint
ALTER TABLE "animal_move" ADD CONSTRAINT "animal_move_from_side_known" CHECK ("from_side" IN ('dairy', 'fattening'));--> statement-breakpoint
ALTER TABLE "animal_move" ADD CONSTRAINT "animal_move_to_side_known" CHECK ("to_side" IN ('dairy', 'fattening'));--> statement-breakpoint
ALTER TABLE "animal" ADD CONSTRAINT "animal_calf_outcome_known" CHECK ("calf_outcome" IN ('alive', 'stillborn'));--> statement-breakpoint
ALTER TABLE "animal" ADD CONSTRAINT "animal_sex_known" CHECK ("sex" IN ('female', 'male'));--> statement-breakpoint
ALTER TABLE "animal" ADD CONSTRAINT "animal_side_known" CHECK ("side" IN ('dairy', 'fattening'));--> statement-breakpoint
ALTER TABLE "animal" ADD CONSTRAINT "animal_source_known" CHECK ("source" IN ('born', 'bought'));--> statement-breakpoint
ALTER TABLE "animal" ADD CONSTRAINT "animal_state_known" CHECK ("state" IN ('calf', 'heifer', 'pregnant_heifer', 'milking', 'dry', 'quarantine', 'fattening', 'ready_for_sale', 'sold', 'died', 'culled', 'lost'));--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_action_known" CHECK ("action" IN ('create', 'update', 'correct', 'export', 'login'));--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_role_used_known" CHECK ("role_used" IN ('owner', 'manager', 'staff', 'vet'));--> statement-breakpoint
ALTER TABLE "backup_run" ADD CONSTRAINT "backup_run_kind_known" CHECK ("kind" IN ('nightly', 'monthly', 'manual'));--> statement-breakpoint
ALTER TABLE "backup_run" ADD CONSTRAINT "backup_run_ok_known" CHECK ("ok" IN ('yes', 'no'));--> statement-breakpoint
ALTER TABLE "buying_trip" ADD CONSTRAINT "buying_trip_recorded_by_role_known" CHECK ("recorded_by_role" IN ('owner', 'manager', 'staff', 'vet'));--> statement-breakpoint
ALTER TABLE "calving" ADD CONSTRAINT "calving_ease_known" CHECK ("ease" IN ('unassisted', 'assisted', 'vet'));--> statement-breakpoint
ALTER TABLE "diagnosis" ADD CONSTRAINT "diagnosis_outcome_known" CHECK ("outcome" IN ('recovered', 'not_recovered'));--> statement-breakpoint
ALTER TABLE "dispatch" ADD CONSTRAINT "dispatch_recorded_by_role_known" CHECK ("recorded_by_role" IN ('owner', 'manager', 'staff', 'vet'));--> statement-breakpoint
ALTER TABLE "drug_product" ADD CONSTRAINT "drug_product_added_by_role_known" CHECK ("added_by_role" IN ('owner', 'manager', 'staff', 'vet'));--> statement-breakpoint
ALTER TABLE "farm_account" ADD CONSTRAINT "farm_account_kind_known" CHECK ("kind" IN ('mobile_money', 'bank'));--> statement-breakpoint
ALTER TABLE "fattening_joining" ADD CONSTRAINT "fattening_joining_how_known" CHECK ("how" IN ('crossed', 'bought_from_venture'));--> statement-breakpoint
ALTER TABLE "feed_in" ADD CONSTRAINT "feed_in_kind_known" CHECK ("kind" IN ('purchase', 'harvest'));--> statement-breakpoint
ALTER TABLE "feed_in" ADD CONSTRAINT "feed_in_pack_kind_known" CHECK ("pack_kind" IN ('bag', 'maund'));--> statement-breakpoint
ALTER TABLE "feed_in" ADD CONSTRAINT "feed_in_recorded_by_role_known" CHECK ("recorded_by_role" IN ('owner', 'manager', 'staff', 'vet'));--> statement-breakpoint
ALTER TABLE "feed_item" ADD CONSTRAINT "feed_item_unit_known" CHECK ("unit" IN ('kg', 'litre', 'bundle'));--> statement-breakpoint
ALTER TABLE "handover" ADD CONSTRAINT "handover_float_known" CHECK ("float" IN ('out', 'back'));--> statement-breakpoint
ALTER TABLE "handover" ADD CONSTRAINT "handover_recorded_by_role_known" CHECK ("recorded_by_role" IN ('owner', 'manager', 'staff', 'vet'));--> statement-breakpoint
ALTER TABLE "head_price" ADD CONSTRAINT "head_price_kind_known" CHECK ("kind" IN ('calf', 'heifer', 'pregnant_heifer', 'milking', 'dry'));--> statement-breakpoint
ALTER TABLE "investment_agreement" ADD CONSTRAINT "investment_agreement_stamp_kind_known" CHECK ("stamp_kind" IN ('paper', 'e_challan', 'in_app'));--> statement-breakpoint
ALTER TABLE "investor_access" ADD CONSTRAINT "investor_access_revoked_why_known" CHECK ("revoked_why" IN ('withdrew_consent', 'lost_phone', 'owner'));--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_invited_by_role_known" CHECK ("invited_by_role" IN ('owner', 'manager', 'staff', 'vet'));--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_roles_known" CHECK ("roles" <@ ARRAY['owner', 'manager', 'staff', 'vet']::text[]);--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_status_known" CHECK ("status" IN ('pending', 'approved', 'revoked'));--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_vet_scope_known" CHECK ("vet_scope" IN ('full', 'visiting'));--> statement-breakpoint
ALTER TABLE "medicine_purchase" ADD CONSTRAINT "medicine_purchase_recorded_by_role_known" CHECK ("recorded_by_role" IN ('owner', 'manager', 'staff', 'vet'));--> statement-breakpoint
ALTER TABLE "milk_record" ADD CONSTRAINT "milk_record_destination_known" CHECK ("destination" IN ('bulk', 'calves', 'discard'));--> statement-breakpoint
ALTER TABLE "missing" ADD CONSTRAINT "missing_state_before_known" CHECK ("state_before" IN ('calf', 'heifer', 'pregnant_heifer', 'milking', 'dry', 'quarantine', 'fattening', 'ready_for_sale', 'sold', 'died', 'culled', 'lost'));--> statement-breakpoint
ALTER TABLE "money_category" ADD CONSTRAINT "money_category_direction_known" CHECK ("direction" IN ('in', 'out'));--> statement-breakpoint
ALTER TABLE "money_category" ADD CONSTRAINT "money_category_key_known" CHECK ("key" IN ('dispatch', 'intake', 'buying_trip', 'selling_trip', 'sale', 'sale_broker', 'wage_draw', 'feed_in', 'medicine_purchase', 'vet_fee', 'internal_sale_in', 'internal_sale_out', 'reimbursement', 'settlement_adjustment', 'farm_share', 'farm_loss', 'wages', 'rent', 'utilities', 'repairs', 'hygiene', 'equipment', 'transport', 'manure_sales'));--> statement-breakpoint
ALTER TABLE "money_event" ADD CONSTRAINT "money_event_approval_known" CHECK ("approval" IN ('not_needed', 'awaiting', 'approved'));--> statement-breakpoint
ALTER TABLE "money_event" ADD CONSTRAINT "money_event_direction_known" CHECK ("direction" IN ('in', 'out'));--> statement-breakpoint
ALTER TABLE "money_event" ADD CONSTRAINT "money_event_payment_method_known" CHECK ("payment_method" IN ('cash', 'mobile_money', 'bank'));--> statement-breakpoint
ALTER TABLE "money_event" ADD CONSTRAINT "money_event_recorded_by_role_known" CHECK ("recorded_by_role" IN ('owner', 'manager', 'staff', 'vet'));--> statement-breakpoint
ALTER TABLE "money_event" ADD CONSTRAINT "money_event_side_known" CHECK ("side" IN ('dairy', 'fattening'));--> statement-breakpoint
ALTER TABLE "money_event" ADD CONSTRAINT "money_event_source_known" CHECK ("source" IN ('dispatch', 'intake', 'buying_trip', 'selling_trip', 'sale', 'sale_broker', 'wage_draw', 'feed_in', 'medicine_purchase', 'vet_fee', 'internal_sale_in', 'internal_sale_out', 'reimbursement', 'settlement_adjustment', 'farm_share', 'farm_loss', 'receivable_payment', 'by_hand'));--> statement-breakpoint
ALTER TABLE "mortality" ADD CONSTRAINT "mortality_disposal_known" CHECK ("disposal" IN ('buried', 'burned'));--> statement-breakpoint
ALTER TABLE "mortality" ADD CONSTRAINT "mortality_kind_known" CHECK ("kind" IN ('died', 'culled'));--> statement-breakpoint
ALTER TABLE "mortality" ADD CONSTRAINT "mortality_recorded_by_role_known" CHECK ("recorded_by_role" IN ('owner', 'manager', 'staff', 'vet'));--> statement-breakpoint
ALTER TABLE "needs_review" ADD CONSTRAINT "needs_review_reason_known" CHECK ("reason" IN ('corrected_after_sign_off', 'irreversible_effect', 'late_entry', 'sync_gap', 'clock_skew', 'implausible_weight'));--> statement-breakpoint
ALTER TABLE "nomination" ADD CONSTRAINT "nomination_how_known" CHECK ("how" IN ('nomination', 'agreement', 'carried_over'));--> statement-breakpoint
ALTER TABLE "notifiable_disease" ADD CONSTRAINT "notifiable_disease_added_by_role_known" CHECK ("added_by_role" IN ('owner', 'manager', 'staff', 'vet'));--> statement-breakpoint
ALTER TABLE "paper_template_version" ADD CONSTRAINT "paper_template_version_published_by_role_known" CHECK ("published_by_role" IN ('owner', 'manager', 'staff', 'vet'));--> statement-breakpoint
ALTER TABLE "paper_template" ADD CONSTRAINT "paper_template_kind_known" CHECK ("kind" IN ('investment_agreement', 'master_agreement', 'venture_schedule', 'agreement_amendment', 'portal_consent', 'privacy_notice', 'nomination'));--> statement-breakpoint
ALTER TABLE "password_code" ADD CONSTRAINT "password_code_issued_by_role_known" CHECK ("issued_by_role" IN ('owner', 'manager', 'staff', 'vet'));--> statement-breakpoint
ALTER TABLE "portal_consent" ADD CONSTRAINT "portal_consent_withdrawn_how_known" CHECK ("withdrawn_how" IN ('letter', 'message'));--> statement-breakpoint
ALTER TABLE "pregnancy_check" ADD CONSTRAINT "pregnancy_check_result_known" CHECK ("result" IN ('positive', 'negative'));--> statement-breakpoint
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_route_known" CHECK ("route" IN ('intramuscular', 'intravenous', 'subcutaneous', 'oral', 'intramammary', 'topical'));--> statement-breakpoint
ALTER TABLE "ration_version" ADD CONSTRAINT "ration_version_published_by_role_known" CHECK ("published_by_role" IN ('owner', 'manager', 'staff', 'vet'));--> statement-breakpoint
ALTER TABLE "ready_set_aside" ADD CONSTRAINT "ready_set_aside_grounds_known" CHECK ("grounds" <@ ARRAY['weight', 'window']::text[]);--> statement-breakpoint
ALTER TABLE "receivable_payment" ADD CONSTRAINT "receivable_payment_kind_known" CHECK ("kind" IN ('cattle', 'milk'));--> statement-breakpoint
ALTER TABLE "receivable_payment" ADD CONSTRAINT "receivable_payment_recorded_by_role_known" CHECK ("recorded_by_role" IN ('owner', 'manager', 'staff', 'vet'));--> statement-breakpoint
ALTER TABLE "receivable_write_off" ADD CONSTRAINT "receivable_write_off_source_known" CHECK ("source" IN ('sale', 'dispatch'));--> statement-breakpoint
ALTER TABLE "repeat_breeder_answer" ADD CONSTRAINT "repeat_breeder_answer_answered_by_role_known" CHECK ("answered_by_role" IN ('owner', 'manager', 'staff', 'vet'));--> statement-breakpoint
ALTER TABLE "repeat_breeder_answer" ADD CONSTRAINT "repeat_breeder_answer_decision_known" CHECK ("decision" IN ('serve_again', 'treat', 'cull'));--> statement-breakpoint
ALTER TABLE "request_to_join_change" ADD CONSTRAINT "request_to_join_change_kind_known" CHECK ("kind" IN ('made', 'changed', 'withdrawn'));--> statement-breakpoint
ALTER TABLE "request_to_join" ADD CONSTRAINT "request_to_join_closed_because_known" CHECK ("closed_because" IN ('venture_buying', 'venture_cancelled', 'taken_out_of_portal', 'investor_retired'));--> statement-breakpoint
ALTER TABLE "request_to_join" ADD CONSTRAINT "request_to_join_state_known" CHECK ("state" IN ('waiting', 'come_and_sign', 'not_this_time', 'withdrawn', 'signed', 'closed'));--> statement-breakpoint
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_granted_by_role_known" CHECK ("granted_by_role" IN ('owner', 'manager', 'staff', 'vet'));--> statement-breakpoint
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_role_known" CHECK ("role" IN ('owner', 'manager', 'staff', 'vet'));--> statement-breakpoint
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_scope_known" CHECK ("scope" IN ('full', 'visiting'));--> statement-breakpoint
ALTER TABLE "selling_trip" ADD CONSTRAINT "selling_trip_recorded_by_role_known" CHECK ("recorded_by_role" IN ('owner', 'manager', 'staff', 'vet'));--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_method_known" CHECK ("method" IN ('ai', 'natural'));--> statement-breakpoint
ALTER TABLE "shed_phone" ADD CONSTRAINT "shed_phone_enrolled_by_role_known" CHECK ("enrolled_by_role" IN ('owner', 'manager', 'staff', 'vet'));--> statement-breakpoint
ALTER TABLE "sop_instance" ADD CONSTRAINT "sop_instance_assigned_role_known" CHECK ("assigned_role" IN ('owner', 'manager', 'staff', 'vet'));--> statement-breakpoint
ALTER TABLE "sop_instance" ADD CONSTRAINT "sop_instance_checker_role_known" CHECK ("checker_role" IN ('owner', 'manager', 'staff', 'vet'));--> statement-breakpoint
ALTER TABLE "sop_instance" ADD CONSTRAINT "sop_instance_state_known" CHECK ("state" IN ('due', 'in_progress', 'completed', 'approved', 'sent_back', 'missed', 'called_off'));--> statement-breakpoint
ALTER TABLE "sop_proposal" ADD CONSTRAINT "sop_proposal_proposed_by_role_known" CHECK ("proposed_by_role" IN ('owner', 'manager', 'staff', 'vet'));--> statement-breakpoint
ALTER TABLE "sop_proposal" ADD CONSTRAINT "sop_proposal_status_known" CHECK ("status" IN ('pending', 'approved', 'rejected'));--> statement-breakpoint
ALTER TABLE "sop_training" ADD CONSTRAINT "sop_training_trained_by_role_known" CHECK ("trained_by_role" IN ('owner', 'manager', 'staff', 'vet'));--> statement-breakpoint
ALTER TABLE "sop_version" ADD CONSTRAINT "sop_version_published_by_role_known" CHECK ("published_by_role" IN ('owner', 'manager', 'staff', 'vet'));--> statement-breakpoint
ALTER TABLE "staff_pin" ADD CONSTRAINT "staff_pin_set_by_role_known" CHECK ("set_by_role" IN ('owner', 'manager', 'staff', 'vet'));--> statement-breakpoint
ALTER TABLE "step_completion" ADD CONSTRAINT "step_completion_destination_known" CHECK ("destination" IN ('bulk', 'calves', 'discard'));--> statement-breakpoint
ALTER TABLE "step_completion" ADD CONSTRAINT "step_completion_status_known" CHECK ("status" IN ('done', 'skipped'));--> statement-breakpoint
ALTER TABLE "sync_entry" ADD CONSTRAINT "sync_entry_kind_known" CHECK ("kind" IN ('instance_claim', 'step_completion', 'completion_photo', 'instance_complete', 'animal_move', 'observation'));--> statement-breakpoint
ALTER TABLE "sync_entry" ADD CONSTRAINT "sync_entry_outcome_known" CHECK ("outcome" IN ('applied', 'flagged', 'kept', 'rejected'));--> statement-breakpoint
ALTER TABLE "tag_sequence" ADD CONSTRAINT "tag_sequence_prefix_known" CHECK ("prefix" IN ('D', 'F'));--> statement-breakpoint
ALTER TABLE "text_message" ADD CONSTRAINT "text_message_kind_known" CHECK ("kind" IN ('instance_overdue', 'instance_escalated', 'instance_sent_back', 'needs_review', 'sop_published', 'sop_proposed', 'sop_retired', 'sop_restored', 'withdrawal_ending', 'notifiable_diagnosis', 'entry_rejected', 'withdrawal_changed', 'low_stock', 'money_awaiting_approval', 'registration_renewal_due', 'investor_statement_due', 'reimbursement_due', 'day_not_turning', 'backup_overdue', 'lot_expiring', 'lot_expired', 'medicine_low_stock', 'expired_dose_given', 'join_requested', 'receivable_overdue', 'animal_missing', 'store_shortfall', 'pen_sores_seen', 'milk_unaccounted', 'head_count_differs', 'dose_not_prescribed', 'entered_twice', 'sold_under_cost', 'still_here_after_eid', 'medicine_short', 'feed_price_jump', 'settings_changed', 'cash_short', 'arrival_weight_short', 'large_shrink', 'mortality_recorded', 'mortality_undiagnosed', 'monthly_sum_missed'));--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_language_known" CHECK ("language" IN ('bn', 'en'));--> statement-breakpoint
ALTER TABLE "venture_movement" ADD CONSTRAINT "venture_movement_kind_known" CHECK ("kind" IN ('capital_in', 'refund', 'float_out', 'float_back', 'internal_buy', 'internal_sell', 'sale_in', 'payout', 'advance_repaid', 'farm_share', 'farm_loss_in', 'reimbursement', 'advance', 'intake_out'));--> statement-breakpoint
ALTER TABLE "venture_plan" ADD CONSTRAINT "venture_plan_made_while_known" CHECK ("made_while" IN ('open', 'buying', 'fattening', 'selling', 'settled', 'cancelled'));--> statement-breakpoint
ALTER TABLE "venture_settlement_adjustment" ADD CONSTRAINT "venture_settlement_adjustment_outcome_known" CHECK ("outcome" IN ('noted', 'outstanding', 'paid', 'waived'));--> statement-breakpoint
ALTER TABLE "venture" ADD CONSTRAINT "venture_capital_paid_known" CHECK ("capital_paid" IN ('before_buying', 'by_the_month'));--> statement-breakpoint
ALTER TABLE "venture" ADD CONSTRAINT "venture_opened_by_role_known" CHECK ("opened_by_role" IN ('owner', 'manager', 'staff', 'vet'));--> statement-breakpoint
ALTER TABLE "venture" ADD CONSTRAINT "venture_state_known" CHECK ("state" IN ('open', 'buying', 'fattening', 'selling', 'settled', 'cancelled'));--> statement-breakpoint
ALTER TABLE "weaning" ADD CONSTRAINT "weaning_to_known" CHECK ("to" IN ('dairy', 'fattening'));--> statement-breakpoint
ALTER TABLE "weigh_in" ADD CONSTRAINT "weigh_in_method_known" CHECK ("method" IN ('scale'));--> statement-breakpoint
ALTER TABLE "buying_trip" ADD CONSTRAINT "buying_trip_broker_money_not_negative" CHECK ("broker_money" >= 0);--> statement-breakpoint
ALTER TABLE "buying_trip" ADD CONSTRAINT "buying_trip_keep_money_not_negative" CHECK ("keep_money" >= 0);--> statement-breakpoint
ALTER TABLE "buying_trip" ADD CONSTRAINT "buying_trip_transport_money_not_negative" CHECK ("transport_money" >= 0);--> statement-breakpoint
ALTER TABLE "selling_trip" ADD CONSTRAINT "selling_trip_keep_money_not_negative" CHECK ("keep_money" >= 0);--> statement-breakpoint
ALTER TABLE "selling_trip" ADD CONSTRAINT "selling_trip_transport_money_not_negative" CHECK ("transport_money" >= 0);--> statement-breakpoint
ALTER TABLE "cash_count" ADD CONSTRAINT "cash_count_counted_not_negative" CHECK ("counted" >= 0);--> statement-breakpoint
ALTER TABLE "head_count" ADD CONSTRAINT "head_count_counted_not_negative" CHECK ("counted" >= 0);--> statement-breakpoint
ALTER TABLE "stock_count" ADD CONSTRAINT "stock_count_counted_not_negative" CHECK ("counted" >= 0);--> statement-breakpoint
ALTER TABLE "medicine_count" ADD CONSTRAINT "medicine_count_counted_not_negative" CHECK ("counted" >= 0);--> statement-breakpoint
ALTER TABLE "dairy_entry_price" ADD CONSTRAINT "dairy_entry_price_price_money_not_negative" CHECK ("price_money" >= 0);--> statement-breakpoint
ALTER TABLE "head_price" ADD CONSTRAINT "head_price_high_money_not_negative" CHECK ("high_money" >= 0);--> statement-breakpoint
ALTER TABLE "head_price" ADD CONSTRAINT "head_price_low_money_not_negative" CHECK ("low_money" >= 0);--> statement-breakpoint
ALTER TABLE "dispatch" ADD CONSTRAINT "dispatch_litres_not_negative" CHECK ("litres" >= 0);--> statement-breakpoint
ALTER TABLE "dispatch" ADD CONSTRAINT "dispatch_price_per_litre_money_not_negative" CHECK ("price_per_litre_money" >= 0);--> statement-breakpoint
ALTER TABLE "dispatch" ADD CONSTRAINT "dispatch_receivable_money_not_negative" CHECK ("receivable_money" >= 0);--> statement-breakpoint
ALTER TABLE "fattening_joining" ADD CONSTRAINT "fattening_joining_price_money_not_negative" CHECK ("price_money" >= 0);--> statement-breakpoint
ALTER TABLE "fattening_joining" ADD CONSTRAINT "fattening_joining_rate_money_per_kg_not_negative" CHECK ("rate_money_per_kg" >= 0);--> statement-breakpoint
ALTER TABLE "fattening_joining" ADD CONSTRAINT "fattening_joining_weight_kg_not_negative" CHECK ("weight_kg" >= 0);--> statement-breakpoint
ALTER TABLE "fattening_joining" ADD CONSTRAINT "fattening_joining_target_weight_kg_not_negative" CHECK ("target_weight_kg" >= 0);--> statement-breakpoint
ALTER TABLE "feed_in" ADD CONSTRAINT "feed_in_pack_count_not_negative" CHECK ("pack_count" >= 0);--> statement-breakpoint
ALTER TABLE "feed_in" ADD CONSTRAINT "feed_in_price_money_not_negative" CHECK ("price_money" >= 0);--> statement-breakpoint
ALTER TABLE "feed_in" ADD CONSTRAINT "feed_in_quantity_not_negative" CHECK ("quantity" >= 0);--> statement-breakpoint
ALTER TABLE "feed_in" ADD CONSTRAINT "feed_in_slip_quantity_not_negative" CHECK ("slip_quantity" >= 0);--> statement-breakpoint
ALTER TABLE "feed_item" ADD CONSTRAINT "feed_item_bag_size_kg_not_negative" CHECK ("bag_size_kg" >= 0);--> statement-breakpoint
ALTER TABLE "feed_item" ADD CONSTRAINT "feed_item_fodder_price_money_not_negative" CHECK ("fodder_price_money" >= 0);--> statement-breakpoint
ALTER TABLE "feeding" ADD CONSTRAINT "feeding_animals_not_negative" CHECK ("animals" >= 0);--> statement-breakpoint
ALTER TABLE "feeding" ADD CONSTRAINT "feeding_herd_weight_kg_not_negative" CHECK ("herd_weight_kg" >= 0);--> statement-breakpoint
ALTER TABLE "feeding" ADD CONSTRAINT "feeding_sessions_per_day_not_negative" CHECK ("sessions_per_day" >= 0);--> statement-breakpoint
ALTER TABLE "handover" ADD CONSTRAINT "handover_amount_money_not_negative" CHECK ("amount_money" >= 0);--> statement-breakpoint
ALTER TABLE "intake" ADD CONSTRAINT "intake_market_toll_money_not_negative" CHECK ("market_toll_money" >= 0);--> statement-breakpoint
ALTER TABLE "intake" ADD CONSTRAINT "intake_purchase_price_money_not_negative" CHECK ("purchase_price_money" >= 0);--> statement-breakpoint
ALTER TABLE "intake" ADD CONSTRAINT "intake_target_weight_kg_not_negative" CHECK ("target_weight_kg" >= 0);--> statement-breakpoint
ALTER TABLE "intake" ADD CONSTRAINT "intake_weight_kg_not_negative" CHECK ("weight_kg" >= 0);--> statement-breakpoint
ALTER TABLE "internal_sale" ADD CONSTRAINT "internal_sale_price_money_not_negative" CHECK ("price_money" >= 0);--> statement-breakpoint
ALTER TABLE "internal_sale" ADD CONSTRAINT "internal_sale_rate_money_per_kg_not_negative" CHECK ("rate_money_per_kg" >= 0);--> statement-breakpoint
ALTER TABLE "internal_sale" ADD CONSTRAINT "internal_sale_weight_kg_not_negative" CHECK ("weight_kg" >= 0);--> statement-breakpoint
ALTER TABLE "investment_agreement" ADD CONSTRAINT "investment_agreement_stamp_value_money_not_negative" CHECK ("stamp_value_money" >= 0);--> statement-breakpoint
ALTER TABLE "investment_agreement" ADD CONSTRAINT "investment_agreement_units_not_negative" CHECK ("units" >= 0);--> statement-breakpoint
ALTER TABLE "medicine_purchase" ADD CONSTRAINT "medicine_purchase_doses_not_negative" CHECK ("doses" >= 0);--> statement-breakpoint
ALTER TABLE "medicine_purchase" ADD CONSTRAINT "medicine_purchase_price_money_not_negative" CHECK ("price_money" >= 0);--> statement-breakpoint
ALTER TABLE "milk_record" ADD CONSTRAINT "milk_record_litres_not_negative" CHECK ("litres" >= 0);--> statement-breakpoint
ALTER TABLE "milking_session" ADD CONSTRAINT "milking_session_bulk_litres_not_negative" CHECK ("bulk_litres" >= 0);--> statement-breakpoint
ALTER TABLE "milking_session" ADD CONSTRAINT "milking_session_sum_bulk_litres_not_negative" CHECK ("sum_bulk_litres" >= 0);--> statement-breakpoint
ALTER TABLE "money_event" ADD CONSTRAINT "money_event_amount_money_not_negative" CHECK ("amount_money" >= 0);--> statement-breakpoint
ALTER TABLE "receivable_payment" ADD CONSTRAINT "receivable_payment_amount_money_not_negative" CHECK ("amount_money" >= 0);--> statement-breakpoint
ALTER TABLE "receivable_write_off" ADD CONSTRAINT "receivable_write_off_amount_money_not_negative" CHECK ("amount_money" >= 0);--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_broker_money_not_negative" CHECK ("broker_money" >= 0);--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_price_money_not_negative" CHECK ("price_money" >= 0);--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_receivable_money_not_negative" CHECK ("receivable_money" >= 0);--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_weight_kg_not_negative" CHECK ("weight_kg" >= 0);--> statement-breakpoint
ALTER TABLE "venture_movement" ADD CONSTRAINT "venture_movement_amount_money_not_negative" CHECK ("amount_money" >= 0);--> statement-breakpoint
ALTER TABLE "vet_fee" ADD CONSTRAINT "vet_fee_amount_money_not_negative" CHECK ("amount_money" >= 0);--> statement-breakpoint
ALTER TABLE "wage_draw" ADD CONSTRAINT "wage_draw_amount_money_not_negative" CHECK ("amount_money" >= 0);--> statement-breakpoint
ALTER TABLE "wage_draw_taken" ADD CONSTRAINT "wage_draw_taken_amount_not_negative" CHECK ("amount" >= 0);--> statement-breakpoint
ALTER TABLE "weaning" ADD CONSTRAINT "weaning_weight_kg_not_negative" CHECK ("weight_kg" >= 0);--> statement-breakpoint
ALTER TABLE "weigh_in" ADD CONSTRAINT "weigh_in_weight_kg_not_negative" CHECK ("weight_kg" >= 0);--> statement-breakpoint
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_days_not_negative" CHECK ("days" >= 0);--> statement-breakpoint
ALTER TABLE "treatment" ADD CONSTRAINT "treatment_meat_withdrawal_days_not_negative" CHECK ("meat_withdrawal_days" >= 0);--> statement-breakpoint
ALTER TABLE "treatment" ADD CONSTRAINT "treatment_milk_withdrawal_days_not_negative" CHECK ("milk_withdrawal_days" >= 0);--> statement-breakpoint
ALTER TABLE "drug_product" ADD CONSTRAINT "drug_product_meat_withdrawal_days_not_negative" CHECK ("meat_withdrawal_days" >= 0);--> statement-breakpoint
ALTER TABLE "drug_product" ADD CONSTRAINT "drug_product_milk_withdrawal_days_not_negative" CHECK ("milk_withdrawal_days" >= 0);--> statement-breakpoint
ALTER TABLE "venture" ADD CONSTRAINT "venture_cattle_budget_money_not_negative" CHECK ("cattle_budget_money" >= 0);--> statement-breakpoint
ALTER TABLE "venture" ADD CONSTRAINT "venture_cattle_part_money_not_negative" CHECK ("cattle_part_money" >= 0);--> statement-breakpoint
ALTER TABLE "venture" ADD CONSTRAINT "venture_floor_money_not_negative" CHECK ("floor_money" >= 0);--> statement-breakpoint
ALTER TABLE "venture" ADD CONSTRAINT "venture_target_capital_money_not_negative" CHECK ("target_capital_money" >= 0);--> statement-breakpoint
ALTER TABLE "venture" ADD CONSTRAINT "venture_unit_price_money_not_negative" CHECK ("unit_price_money" >= 0);--> statement-breakpoint
ALTER TABLE "venture" ADD CONSTRAINT "venture_units_not_negative" CHECK ("units" >= 0);--> statement-breakpoint
ALTER TABLE "request_to_join" ADD CONSTRAINT "request_to_join_units_not_negative" CHECK ("units" >= 0);--> statement-breakpoint
ALTER TABLE "request_to_join" ADD CONSTRAINT "request_to_join_answered_units_not_negative" CHECK ("answered_units" >= 0);--> statement-breakpoint
ALTER TABLE "request_to_join_change" ADD CONSTRAINT "request_to_join_change_units_not_negative" CHECK ("units" >= 0);--> statement-breakpoint
ALTER TABLE "agreement_offer" ADD CONSTRAINT "agreement_offer_units_not_negative" CHECK ("units" >= 0);--> statement-breakpoint
ALTER TABLE "ration" ADD CONSTRAINT "ration_weight_from_kg_not_negative" CHECK ("weight_from_kg" >= 0);--> statement-breakpoint
ALTER TABLE "ration" ADD CONSTRAINT "ration_weight_to_kg_not_negative" CHECK ("weight_to_kg" >= 0);--> statement-breakpoint
ALTER TABLE "intake" VALIDATE CONSTRAINT "intake_window_days";--> statement-breakpoint
ALTER TABLE "intake" VALIDATE CONSTRAINT "intake_window_in_order";--> statement-breakpoint
ALTER TABLE "money_event" VALIDATE CONSTRAINT "money_event_wage_month";--> statement-breakpoint
ALTER TABLE "venture" VALIDATE CONSTRAINT "venture_floor_within_target";--> statement-breakpoint
ALTER TABLE "venture" VALIDATE CONSTRAINT "venture_window_days";--> statement-breakpoint
ALTER TABLE "venture" VALIDATE CONSTRAINT "venture_window_in_order";--> statement-breakpoint
ALTER TABLE "investment_agreement" VALIDATE CONSTRAINT "investment_agreement_percent_whole";--> statement-breakpoint
ALTER TABLE "investment_agreement" VALIDATE CONSTRAINT "investment_agreement_window_days";--> statement-breakpoint
ALTER TABLE "investment_agreement" VALIDATE CONSTRAINT "investment_agreement_window_in_order";--> statement-breakpoint
ALTER TABLE "venture_movement" VALIDATE CONSTRAINT "venture_movement_month";--> statement-breakpoint
ALTER TABLE "venture_bank_check" VALIDATE CONSTRAINT "venture_bank_check_month";--> statement-breakpoint
ALTER TABLE "agreement_amendment" VALIDATE CONSTRAINT "agreement_amendment_percent_whole";--> statement-breakpoint
ALTER TABLE "agreement_amendment" VALIDATE CONSTRAINT "agreement_amendment_window_days";--> statement-breakpoint
ALTER TABLE "agreement_amendment" VALIDATE CONSTRAINT "agreement_amendment_window_in_order";--> statement-breakpoint
ALTER TABLE "nominee" VALIDATE CONSTRAINT "nominee_percent_whole";--> statement-breakpoint
ALTER TABLE "farm_account_check" VALIDATE CONSTRAINT "farm_account_check_month";--> statement-breakpoint
ALTER TABLE "agreement_offer" VALIDATE CONSTRAINT "agreement_offer_percent_whole";--> statement-breakpoint
ALTER TABLE "amendment_offer" VALIDATE CONSTRAINT "amendment_offer_percent_whole";--> statement-breakpoint
ALTER TABLE "amendment_offer" VALIDATE CONSTRAINT "amendment_offer_window_days";--> statement-breakpoint
ALTER TABLE "amendment_offer" VALIDATE CONSTRAINT "amendment_offer_window_in_order";
