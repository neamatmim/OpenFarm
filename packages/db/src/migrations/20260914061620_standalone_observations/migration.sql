ALTER TABLE "observation" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "observation" ALTER COLUMN "completion_id" DROP NOT NULL;