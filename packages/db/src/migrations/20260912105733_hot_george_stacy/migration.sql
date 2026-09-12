ALTER TABLE "dls_report" ADD COLUMN "disease_id" text;--> statement-breakpoint
ALTER TABLE "dls_report" ADD COLUMN "withdrawn_at" timestamp;--> statement-breakpoint
ALTER TABLE "mortality" ADD COLUMN "diagnosis_id" text;--> statement-breakpoint
ALTER TABLE "dls_report" ALTER COLUMN "instance_id" DROP NOT NULL;--> statement-breakpoint
DROP INDEX "dls_report_instance_uidx";--> statement-breakpoint
CREATE UNIQUE INDEX "dls_report_instance_uidx" ON "dls_report" ("instance_id") WHERE "instance_id" is not null;--> statement-breakpoint
ALTER TABLE "dls_report" ADD CONSTRAINT "dls_report_disease_id_notifiable_disease_id_fkey" FOREIGN KEY ("disease_id") REFERENCES "notifiable_disease"("id");