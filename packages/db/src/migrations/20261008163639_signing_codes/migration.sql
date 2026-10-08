CREATE TABLE "signing_code" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"investor_id" text NOT NULL,
	"offer_kind" text NOT NULL,
	"offer_id" text NOT NULL,
	"sms_code_hash" text,
	"sms_to" text,
	"email_code_hash" text,
	"email_to" text,
	"sent_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "signing_code_sent_somewhere" CHECK ("sms_code_hash" is not null or "email_code_hash" is not null)
);
--> statement-breakpoint
CREATE TABLE "signing_proof" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"investor_id" text NOT NULL,
	"offer_kind" text NOT NULL,
	"offer_id" text NOT NULL,
	"agreed_by" text NOT NULL,
	"agreed_at" timestamp with time zone NOT NULL,
	"paper_hash" text NOT NULL,
	"channel" text NOT NULL,
	"sent_to" text NOT NULL,
	"code_sent_at" timestamp with time zone NOT NULL,
	"caller_address" text,
	"caller_agent" text,
	"confirmed_at" timestamp with time zone,
	"confirmed_by_sms" boolean DEFAULT false NOT NULL,
	"confirmed_by_email" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "signing_code_offer_uidx" ON "signing_code" ("investor_id","offer_kind","offer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "signing_proof_offer_uidx" ON "signing_proof" ("offer_kind","offer_id","investor_id");--> statement-breakpoint
ALTER TABLE "signing_code" ADD CONSTRAINT "signing_code_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "signing_code" ADD CONSTRAINT "signing_code_investor_id_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investor"("id");--> statement-breakpoint
ALTER TABLE "signing_proof" ADD CONSTRAINT "signing_proof_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "signing_proof" ADD CONSTRAINT "signing_proof_investor_id_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investor"("id");--> statement-breakpoint
ALTER TABLE "signing_proof" ADD CONSTRAINT "signing_proof_agreed_by_user_id_fkey" FOREIGN KEY ("agreed_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "signing_code" ADD CONSTRAINT "signing_code_offer_kind_known" CHECK ("offer_kind" IN ('agreement_offer', 'amendment_offer'));--> statement-breakpoint
ALTER TABLE "signing_proof" ADD CONSTRAINT "signing_proof_offer_kind_known" CHECK ("offer_kind" IN ('agreement_offer', 'amendment_offer'));--> statement-breakpoint
ALTER TABLE "signing_proof" ADD CONSTRAINT "signing_proof_channel_known" CHECK ("channel" IN ('sms', 'email'));
