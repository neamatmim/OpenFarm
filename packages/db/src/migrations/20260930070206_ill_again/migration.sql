ALTER TABLE "farm" ADD COLUMN "ill_again_diagnoses" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "ill_again_days" integer DEFAULT 365 NOT NULL;--> statement-breakpoint
ALTER TABLE "diagnosis" ADD COLUMN "outcome" text;--> statement-breakpoint
ALTER TABLE "diagnosis" ADD COLUMN "closed_at" timestamp;--> statement-breakpoint
ALTER TABLE "diagnosis" ADD COLUMN "closed_by" text;--> statement-breakpoint
ALTER TABLE "diagnosis" ADD CONSTRAINT "diagnosis_closed_by_user_id_fkey" FOREIGN KEY ("closed_by") REFERENCES "user"("id");