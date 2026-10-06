-- A notice that goes to a pocket at once is now marked carried when its push goes, so one the quiet hours held can be
-- carried in the morning. Those raised before this was kept were pushed, or held and lost, already: marked carried
-- as they stand, so the first morning after this does not push a day of old news again.
UPDATE "alert" SET "carried_at" = "created_at"
WHERE "carried_at" IS NULL
  AND "kind" IN ('instance_overdue', 'instance_escalated', 'instance_sent_back', 'entry_rejected', 'withdrawal_changed', 'day_not_turning', 'backup_overdue', 'expired_dose_given', 'animal_missing', 'pen_sores_seen', 'head_count_differs', 'dose_not_prescribed', 'mortality_recorded', 'mortality_undiagnosed', 'pay_in_note_sent');
