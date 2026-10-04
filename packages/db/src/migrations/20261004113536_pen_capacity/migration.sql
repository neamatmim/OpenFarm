ALTER TABLE "pen" ADD COLUMN "capacity" integer;--> statement-breakpoint
ALTER TABLE "pen" ADD CONSTRAINT "pen_capacity_positive" CHECK ("capacity" > 0);