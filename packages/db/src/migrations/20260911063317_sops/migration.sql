CREATE TABLE "sop_definition" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"current_version_id" text,
	"retired_at" timestamp,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sop_proposal" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"definition_id" text NOT NULL,
	"based_on_version_id" text,
	"content" jsonb NOT NULL,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"proposed_by" text,
	"proposed_by_role" text,
	"decided_by" text,
	"decided_at" timestamp,
	"decision_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sop_version" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"definition_id" text NOT NULL,
	"number" integer NOT NULL,
	"content" jsonb NOT NULL,
	"note" text,
	"published_by" text,
	"published_by_role" text,
	"published_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sop_definition_farm_idx" ON "sop_definition" ("farm_id");--> statement-breakpoint
CREATE INDEX "sop_proposal_status_idx" ON "sop_proposal" ("farm_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "sop_version_number_uidx" ON "sop_version" ("definition_id","number");--> statement-breakpoint
ALTER TABLE "sop_definition" ADD CONSTRAINT "sop_definition_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sop_definition" ADD CONSTRAINT "sop_definition_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "sop_proposal" ADD CONSTRAINT "sop_proposal_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sop_proposal" ADD CONSTRAINT "sop_proposal_definition_id_sop_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "sop_definition"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sop_proposal" ADD CONSTRAINT "sop_proposal_based_on_version_id_sop_version_id_fkey" FOREIGN KEY ("based_on_version_id") REFERENCES "sop_version"("id");--> statement-breakpoint
ALTER TABLE "sop_proposal" ADD CONSTRAINT "sop_proposal_proposed_by_user_id_fkey" FOREIGN KEY ("proposed_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "sop_proposal" ADD CONSTRAINT "sop_proposal_decided_by_user_id_fkey" FOREIGN KEY ("decided_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "sop_version" ADD CONSTRAINT "sop_version_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sop_version" ADD CONSTRAINT "sop_version_definition_id_sop_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "sop_definition"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sop_version" ADD CONSTRAINT "sop_version_published_by_user_id_fkey" FOREIGN KEY ("published_by") REFERENCES "user"("id");