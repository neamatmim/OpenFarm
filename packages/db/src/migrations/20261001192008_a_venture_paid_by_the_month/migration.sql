ALTER TABLE "venture" ADD COLUMN "capital_paid" text DEFAULT 'before_buying' NOT NULL;--> statement-breakpoint
ALTER TABLE "venture" ADD COLUMN "cattle_part_bdt" numeric(12,2);--> statement-breakpoint
ALTER TABLE "venture" ADD COLUMN "monthly_sums" integer;--> statement-breakpoint
ALTER TABLE "venture" ADD COLUMN "first_sum_due_on" text;