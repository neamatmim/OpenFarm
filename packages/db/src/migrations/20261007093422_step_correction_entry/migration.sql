-- A phone may send a Correction of a Step it has already sent, made with no signal, behind it.
ALTER TABLE "sync_entry" DROP CONSTRAINT "sync_entry_kind_known";--> statement-breakpoint
ALTER TABLE "sync_entry" ADD CONSTRAINT "sync_entry_kind_known" CHECK ("kind" IN ('instance_claim', 'step_completion', 'completion_photo', 'instance_complete', 'animal_move', 'observation', 'step_correction'));
