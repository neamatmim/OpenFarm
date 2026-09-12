CREATE TABLE "dls_report" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"diagnosis_id" text NOT NULL,
	"instance_id" text NOT NULL,
	"delivered_at" timestamp,
	"reference" text,
	"completion_id" text,
	"delivered_by" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifiable_disease" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"name_bn" text NOT NULL,
	"name_en" text,
	"note" text,
	"added_by" text,
	"added_by_role" text,
	"created_at" timestamp NOT NULL,
	"retired_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX "dls_report_diagnosis_uidx" ON "dls_report" ("diagnosis_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dls_report_instance_uidx" ON "dls_report" ("instance_id");--> statement-breakpoint
CREATE INDEX "dls_report_farm_idx" ON "dls_report" ("farm_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifiable_disease_name_uidx" ON "notifiable_disease" ("farm_id","name_bn");--> statement-breakpoint
CREATE INDEX "notifiable_disease_farm_idx" ON "notifiable_disease" ("farm_id");--> statement-breakpoint
ALTER TABLE "dls_report" ADD CONSTRAINT "dls_report_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "dls_report" ADD CONSTRAINT "dls_report_diagnosis_id_diagnosis_id_fkey" FOREIGN KEY ("diagnosis_id") REFERENCES "diagnosis"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "dls_report" ADD CONSTRAINT "dls_report_instance_id_sop_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "sop_instance"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "dls_report" ADD CONSTRAINT "dls_report_completion_id_step_completion_id_fkey" FOREIGN KEY ("completion_id") REFERENCES "step_completion"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "dls_report" ADD CONSTRAINT "dls_report_delivered_by_user_id_fkey" FOREIGN KEY ("delivered_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "notifiable_disease" ADD CONSTRAINT "notifiable_disease_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notifiable_disease" ADD CONSTRAINT "notifiable_disease_added_by_user_id_fkey" FOREIGN KEY ("added_by") REFERENCES "user"("id");