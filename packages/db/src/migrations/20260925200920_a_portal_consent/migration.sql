CREATE TABLE "portal_consent" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"investor_id" text NOT NULL,
	"version_id" text NOT NULL,
	"signed_on" timestamp NOT NULL,
	"recorded_by" text NOT NULL,
	"recorded_at" timestamp NOT NULL,
	"withdrawn_on" timestamp,
	"withdrawn_how" text
);
--> statement-breakpoint
CREATE INDEX "portal_consent_investor_idx" ON "portal_consent" ("investor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_consent_in_force_uidx" ON "portal_consent" ("investor_id") WHERE "withdrawn_on" is null;--> statement-breakpoint
ALTER TABLE "portal_consent" ADD CONSTRAINT "portal_consent_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "portal_consent" ADD CONSTRAINT "portal_consent_investor_id_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investor"("id");--> statement-breakpoint
ALTER TABLE "portal_consent" ADD CONSTRAINT "portal_consent_version_id_paper_template_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "paper_template_version"("id");--> statement-breakpoint
ALTER TABLE "portal_consent" ADD CONSTRAINT "portal_consent_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");