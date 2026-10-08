ALTER TABLE "nominee" ADD COLUMN "nid" text;--> statement-breakpoint
ALTER TABLE "nominee" ADD COLUMN "birth_registration" text;--> statement-breakpoint
ALTER TABLE "nominee" ADD COLUMN "receiver_nid" text;--> statement-breakpoint
ALTER TABLE "nominee" ADD CONSTRAINT "nominee_known_by_one_number" CHECK ("nid" is null or "birth_registration" is null);