CREATE TABLE "nomination_offer" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"investor_id" text NOT NULL,
	"nominees" jsonb NOT NULL,
	"template_version_id" text,
	"paper" jsonb NOT NULL,
	"paper_hash" text NOT NULL,
	"offered_by" text,
	"offered_at" timestamp with time zone NOT NULL,
	"agreed_by" text,
	"agreed_at" timestamp with time zone,
	"agreement_withdrawn_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"nomination_id" text
);
--> statement-breakpoint
CREATE INDEX "nomination_offer_investor_idx" ON "nomination_offer" ("investor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nomination_offer_standing_uidx" ON "nomination_offer" ("investor_id") WHERE "withdrawn_at" is null and "approved_at" is null;--> statement-breakpoint
ALTER TABLE "nomination_offer" ADD CONSTRAINT "nomination_offer_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "nomination_offer" ADD CONSTRAINT "nomination_offer_investor_id_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investor"("id");--> statement-breakpoint
ALTER TABLE "nomination_offer" ADD CONSTRAINT "nomination_offer_XtRbAzTkzNrI_fkey" FOREIGN KEY ("template_version_id") REFERENCES "paper_template_version"("id");--> statement-breakpoint
ALTER TABLE "nomination_offer" ADD CONSTRAINT "nomination_offer_offered_by_user_id_fkey" FOREIGN KEY ("offered_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "nomination_offer" ADD CONSTRAINT "nomination_offer_agreed_by_user_id_fkey" FOREIGN KEY ("agreed_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "nomination_offer" ADD CONSTRAINT "nomination_offer_approved_by_user_id_fkey" FOREIGN KEY ("approved_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "nomination_offer" ADD CONSTRAINT "nomination_offer_nomination_id_nomination_id_fkey" FOREIGN KEY ("nomination_id") REFERENCES "nomination"("id");--> statement-breakpoint
ALTER TABLE "nomination" DROP CONSTRAINT "nomination_how_known";--> statement-breakpoint
ALTER TABLE "nomination" ADD CONSTRAINT "nomination_how_known" CHECK ("how" IN ('nomination', 'agreement', 'carried_over', 'in_app'));--> statement-breakpoint
ALTER TABLE "signing_code" DROP CONSTRAINT "signing_code_offer_kind_known";--> statement-breakpoint
ALTER TABLE "signing_code" ADD CONSTRAINT "signing_code_offer_kind_known" CHECK ("offer_kind" IN ('agreement_offer', 'amendment_offer', 'nomination_offer'));--> statement-breakpoint
ALTER TABLE "signing_proof" DROP CONSTRAINT "signing_proof_offer_kind_known";--> statement-breakpoint
ALTER TABLE "signing_proof" ADD CONSTRAINT "signing_proof_offer_kind_known" CHECK ("offer_kind" IN ('agreement_offer', 'amendment_offer', 'nomination_offer'));
