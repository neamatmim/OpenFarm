CREATE TABLE "amendment_offer" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"venture_id" text NOT NULL,
	"investors_percent" integer NOT NULL,
	"target_window_start" text NOT NULL,
	"target_window_end" text NOT NULL,
	"reason" text NOT NULL,
	"template_version_id" text,
	"paper" jsonb NOT NULL,
	"paper_hash" text NOT NULL,
	"offered_by" text,
	"offered_at" timestamp NOT NULL,
	"withdrawn_at" timestamp,
	"approved_by" text,
	"approved_at" timestamp,
	"amended_id" text
);
--> statement-breakpoint
CREATE TABLE "amendment_offer_answer" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"offer_id" text NOT NULL,
	"agreement_id" text NOT NULL,
	"agreed_by" text,
	"agreed_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "amendment_offer_venture_idx" ON "amendment_offer" ("venture_id");--> statement-breakpoint
CREATE UNIQUE INDEX "amendment_offer_answer_uidx" ON "amendment_offer_answer" ("offer_id","agreement_id");--> statement-breakpoint
ALTER TABLE "amendment_offer" ADD CONSTRAINT "amendment_offer_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "amendment_offer" ADD CONSTRAINT "amendment_offer_venture_id_venture_id_fkey" FOREIGN KEY ("venture_id") REFERENCES "venture"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "amendment_offer" ADD CONSTRAINT "amendment_offer_4Dao9jlBH6V9_fkey" FOREIGN KEY ("template_version_id") REFERENCES "paper_template_version"("id");--> statement-breakpoint
ALTER TABLE "amendment_offer" ADD CONSTRAINT "amendment_offer_offered_by_user_id_fkey" FOREIGN KEY ("offered_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "amendment_offer" ADD CONSTRAINT "amendment_offer_approved_by_user_id_fkey" FOREIGN KEY ("approved_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "amendment_offer_answer" ADD CONSTRAINT "amendment_offer_answer_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "amendment_offer_answer" ADD CONSTRAINT "amendment_offer_answer_offer_id_amendment_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "amendment_offer"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "amendment_offer_answer" ADD CONSTRAINT "amendment_offer_answer_oIoAkg7DR8v7_fkey" FOREIGN KEY ("agreement_id") REFERENCES "investment_agreement"("id");--> statement-breakpoint
ALTER TABLE "amendment_offer_answer" ADD CONSTRAINT "amendment_offer_answer_agreed_by_user_id_fkey" FOREIGN KEY ("agreed_by") REFERENCES "user"("id");