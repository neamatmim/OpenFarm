CREATE TABLE "agreement_amendment" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"agreement_id" text NOT NULL,
	"amended_id" text NOT NULL,
	"signed_on" text NOT NULL,
	"investors_percent" integer NOT NULL,
	"target_window_start" text NOT NULL,
	"target_window_end" text NOT NULL,
	"reason" text NOT NULL,
	"amended_by" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amendment_paper" (
	"amended_id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"content_type" text NOT NULL,
	"data" text NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agreement_amendment_uidx" ON "agreement_amendment" ("agreement_id","amended_id");--> statement-breakpoint
ALTER TABLE "agreement_amendment" ADD CONSTRAINT "agreement_amendment_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agreement_amendment" ADD CONSTRAINT "agreement_amendment_agreement_id_investment_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "investment_agreement"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agreement_amendment" ADD CONSTRAINT "agreement_amendment_amended_by_user_id_fkey" FOREIGN KEY ("amended_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "amendment_paper" ADD CONSTRAINT "amendment_paper_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;