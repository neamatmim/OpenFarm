ALTER TABLE "farm" ADD COLUMN "default_milk_withdrawal_days" integer;--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "default_meat_withdrawal_days" integer;--> statement-breakpoint
ALTER TABLE "treatment" ADD COLUMN "advice" text;--> statement-breakpoint
ALTER TABLE "treatment" ADD COLUMN "milk_withdrawal_days" integer;--> statement-breakpoint
ALTER TABLE "treatment" ADD COLUMN "meat_withdrawal_days" integer;--> statement-breakpoint
ALTER TABLE "treatment" ALTER COLUMN "instance_id" DROP NOT NULL;