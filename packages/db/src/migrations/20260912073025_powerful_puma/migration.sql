CREATE TABLE "prescription" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"diagnosis_id" text NOT NULL,
	"product_id" text NOT NULL,
	"dose" text NOT NULL,
	"route" text NOT NULL,
	"times" text[] NOT NULL,
	"days" integer NOT NULL,
	"prescribed_by" text NOT NULL,
	"prescribed_at" timestamp NOT NULL,
	"recorded_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treatment" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"prescription_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"instance_id" text NOT NULL,
	"number" integer NOT NULL,
	"due_at" timestamp NOT NULL,
	"completion_id" text,
	"given_by" text,
	"given_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "prescription_animal_idx" ON "prescription" ("animal_id","prescribed_at");--> statement-breakpoint
CREATE INDEX "prescription_farm_idx" ON "prescription" ("farm_id","prescribed_at");--> statement-breakpoint
CREATE INDEX "prescription_diagnosis_idx" ON "prescription" ("diagnosis_id");--> statement-breakpoint
CREATE UNIQUE INDEX "treatment_instance_uidx" ON "treatment" ("instance_id");--> statement-breakpoint
CREATE INDEX "treatment_animal_idx" ON "treatment" ("animal_id","given_at");--> statement-breakpoint
CREATE INDEX "treatment_prescription_idx" ON "treatment" ("prescription_id","number");--> statement-breakpoint
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_animal_id_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animal"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_diagnosis_id_diagnosis_id_fkey" FOREIGN KEY ("diagnosis_id") REFERENCES "diagnosis"("id");--> statement-breakpoint
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_product_id_drug_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "drug_product"("id");--> statement-breakpoint
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_prescribed_by_user_id_fkey" FOREIGN KEY ("prescribed_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "treatment" ADD CONSTRAINT "treatment_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "treatment" ADD CONSTRAINT "treatment_prescription_id_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescription"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "treatment" ADD CONSTRAINT "treatment_animal_id_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animal"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "treatment" ADD CONSTRAINT "treatment_instance_id_sop_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "sop_instance"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "treatment" ADD CONSTRAINT "treatment_completion_id_step_completion_id_fkey" FOREIGN KEY ("completion_id") REFERENCES "step_completion"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "treatment" ADD CONSTRAINT "treatment_given_by_user_id_fkey" FOREIGN KEY ("given_by") REFERENCES "user"("id");