ALTER TABLE "agreement_offer" ADD COLUMN "agreement_withdrawn_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "signing_proof" ADD COLUMN "withdrawn_at" timestamp with time zone;--> statement-breakpoint
DROP INDEX "signing_proof_offer_uidx";--> statement-breakpoint
CREATE UNIQUE INDEX "signing_proof_offer_uidx" ON "signing_proof" ("offer_kind","offer_id","investor_id") WHERE "withdrawn_at" is null;