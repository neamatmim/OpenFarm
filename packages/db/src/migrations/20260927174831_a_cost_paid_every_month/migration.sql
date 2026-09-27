ALTER TABLE "farm" ADD COLUMN "monthly_costs_due_day" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "money_category" ADD COLUMN "paid_monthly_since" timestamp;