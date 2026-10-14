-- Milk for the house and the staff, a Destination of its own at milking: never in the tank, never money (house).
ALTER TABLE "milk_record" DROP CONSTRAINT "milk_record_destination_known";--> statement-breakpoint
ALTER TABLE "milk_record" ADD CONSTRAINT "milk_record_destination_known" CHECK ("destination" IN ('bulk', 'calves', 'discard', 'house'));--> statement-breakpoint
ALTER TABLE "step_completion" DROP CONSTRAINT "step_completion_destination_known";--> statement-breakpoint
ALTER TABLE "step_completion" ADD CONSTRAINT "step_completion_destination_known" CHECK ("destination" IN ('bulk', 'calves', 'discard', 'house'));
