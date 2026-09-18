CREATE TABLE "agreement_paper" (
	"agreement_id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"content_type" text NOT NULL,
	"data" text NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investment_agreement" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"venture_id" text NOT NULL,
	"investor_id" text NOT NULL,
	"units" integer NOT NULL,
	"investors_percent" integer NOT NULL,
	"target_window_start" text NOT NULL,
	"target_window_end" text NOT NULL,
	"arbitrator" text NOT NULL,
	"stamp_value_bdt" numeric(12,2) NOT NULL,
	"stamped_on" text NOT NULL,
	"stamp_serial" text NOT NULL,
	"signed_by" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investor" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"address" text,
	"nid" text,
	"bank_account" text,
	"nominee_name" text,
	"nominee_phone" text,
	"nominee_relation" text,
	"recorded_by" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "investor_cap" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "investor_warn_at" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "investment_agreement_uidx" ON "investment_agreement" ("venture_id","investor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "investor_person_uidx" ON "investor" ("farm_id","name","phone");--> statement-breakpoint
ALTER TABLE "agreement_paper" ADD CONSTRAINT "agreement_paper_agreement_id_investment_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "investment_agreement"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agreement_paper" ADD CONSTRAINT "agreement_paper_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "investment_agreement" ADD CONSTRAINT "investment_agreement_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "investment_agreement" ADD CONSTRAINT "investment_agreement_venture_id_venture_id_fkey" FOREIGN KEY ("venture_id") REFERENCES "venture"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "investment_agreement" ADD CONSTRAINT "investment_agreement_investor_id_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investor"("id");--> statement-breakpoint
ALTER TABLE "investment_agreement" ADD CONSTRAINT "investment_agreement_signed_by_user_id_fkey" FOREIGN KEY ("signed_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "investor" ADD CONSTRAINT "investor_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "investor" ADD CONSTRAINT "investor_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");