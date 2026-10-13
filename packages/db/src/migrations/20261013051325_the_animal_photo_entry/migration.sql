-- A phone may hold an animal's own photo, taken on the tagging walk with no signal, and send it behind (animal_photo).
ALTER TABLE "sync_entry" DROP CONSTRAINT "sync_entry_kind_known";--> statement-breakpoint
ALTER TABLE "sync_entry" ADD CONSTRAINT "sync_entry_kind_known" CHECK ("kind" IN ('instance_claim', 'step_completion', 'completion_photo', 'instance_complete', 'animal_move', 'observation', 'step_correction', 'animal_photo'));
