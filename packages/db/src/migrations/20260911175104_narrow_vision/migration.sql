CREATE TABLE "sop_training" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"definition_id" text NOT NULL,
	"version_id" text NOT NULL,
	"user_id" text NOT NULL,
	"trained_by" text,
	"trained_by_role" text,
	"trained_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sop_training_person_idx" ON "sop_training" ("farm_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sop_training_once_uidx" ON "sop_training" ("version_id","user_id");--> statement-breakpoint
ALTER TABLE "sop_training" ADD CONSTRAINT "sop_training_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sop_training" ADD CONSTRAINT "sop_training_definition_id_sop_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "sop_definition"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sop_training" ADD CONSTRAINT "sop_training_version_id_sop_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "sop_version"("id");--> statement-breakpoint
ALTER TABLE "sop_training" ADD CONSTRAINT "sop_training_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sop_training" ADD CONSTRAINT "sop_training_trained_by_user_id_fkey" FOREIGN KEY ("trained_by") REFERENCES "user"("id");