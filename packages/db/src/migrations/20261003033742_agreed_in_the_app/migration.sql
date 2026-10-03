CREATE TABLE "agreement_offer" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"venture_id" text NOT NULL,
	"investor_id" text NOT NULL,
	"units" integer NOT NULL,
	"investors_percent" integer NOT NULL,
	"arbitrator" text NOT NULL,
	"nominees" jsonb,
	"request_id" text,
	"template_version_id" text,
	"paper" jsonb NOT NULL,
	"paper_hash" text NOT NULL,
	"offered_by" text,
	"offered_at" timestamp NOT NULL,
	"agreed_by" text,
	"agreed_at" timestamp,
	"withdrawn_at" timestamp,
	"approved_by" text,
	"approved_at" timestamp,
	"agreement_id" text
);
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "agreements_in_app" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "agreement_offer_venture_idx" ON "agreement_offer" ("venture_id");--> statement-breakpoint
ALTER TABLE "agreement_offer" ADD CONSTRAINT "agreement_offer_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agreement_offer" ADD CONSTRAINT "agreement_offer_venture_id_venture_id_fkey" FOREIGN KEY ("venture_id") REFERENCES "venture"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agreement_offer" ADD CONSTRAINT "agreement_offer_investor_id_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investor"("id");--> statement-breakpoint
ALTER TABLE "agreement_offer" ADD CONSTRAINT "agreement_offer_request_id_request_to_join_id_fkey" FOREIGN KEY ("request_id") REFERENCES "request_to_join"("id");--> statement-breakpoint
ALTER TABLE "agreement_offer" ADD CONSTRAINT "agreement_offer_4Dao9jlC8KrE_fkey" FOREIGN KEY ("template_version_id") REFERENCES "paper_template_version"("id");--> statement-breakpoint
ALTER TABLE "agreement_offer" ADD CONSTRAINT "agreement_offer_offered_by_user_id_fkey" FOREIGN KEY ("offered_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "agreement_offer" ADD CONSTRAINT "agreement_offer_agreed_by_user_id_fkey" FOREIGN KEY ("agreed_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "agreement_offer" ADD CONSTRAINT "agreement_offer_approved_by_user_id_fkey" FOREIGN KEY ("approved_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "agreement_offer" ADD CONSTRAINT "agreement_offer_agreement_id_investment_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "investment_agreement"("id");