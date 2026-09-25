ALTER TABLE "investment_agreement" ADD COLUMN "request_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "investment_agreement_request_uidx" ON "investment_agreement" ("request_id");--> statement-breakpoint
ALTER TABLE "investment_agreement" ADD CONSTRAINT "investment_agreement_request_id_request_to_join_id_fkey" FOREIGN KEY ("request_id") REFERENCES "request_to_join"("id");