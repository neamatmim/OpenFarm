CREATE TABLE "nomination" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"investor_id" text NOT NULL,
	"signed_on" text NOT NULL,
	"how" text NOT NULL,
	"agreement_id" text,
	"template_version_id" text,
	"recorded_by" text,
	"recorded_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nomination_paper" (
	"nomination_id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"content_type" text NOT NULL,
	"data" text NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nominee" (
	"nomination_id" text,
	"place" integer,
	"name" text NOT NULL,
	"relation" text,
	"phone" text,
	"born_on" text,
	"share_percent" integer NOT NULL,
	"receiver_name" text,
	"receiver_relation" text,
	"receiver_phone" text,
	CONSTRAINT "nominee_pkey" PRIMARY KEY("nomination_id","place")
);
--> statement-breakpoint
-- Every nominee written down before Nominations were kept becomes one carried over and not yet signed for: that one
-- person, collecting the whole, with no date of birth, on the day this runs. An Investor with none has none.
INSERT INTO "nomination" ("id", "farm_id", "investor_id", "signed_on", "how", "recorded_at")
SELECT "id" || '-carried-over', "farm_id", "id", to_char(now() AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM-DD'), 'carried_over', now()
FROM "investor"
WHERE nullif(trim("nominee_name"), '') IS NOT NULL;--> statement-breakpoint
INSERT INTO "nominee" ("nomination_id", "place", "name", "relation", "phone", "share_percent")
SELECT "id" || '-carried-over', 1, trim("nominee_name"), nullif(trim("nominee_relation"), ''), nullif(trim("nominee_phone"), ''), 100
FROM "investor"
WHERE nullif(trim("nominee_name"), '') IS NOT NULL;--> statement-breakpoint
ALTER TABLE "investor" DROP COLUMN "nominee_name";--> statement-breakpoint
ALTER TABLE "investor" DROP COLUMN "nominee_phone";--> statement-breakpoint
ALTER TABLE "investor" DROP COLUMN "nominee_relation";--> statement-breakpoint
CREATE INDEX "nomination_investor_idx" ON "nomination" ("investor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nomination_agreement_uidx" ON "nomination" ("agreement_id") WHERE "agreement_id" is not null;--> statement-breakpoint
ALTER TABLE "nomination" ADD CONSTRAINT "nomination_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "nomination" ADD CONSTRAINT "nomination_investor_id_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investor"("id");--> statement-breakpoint
ALTER TABLE "nomination" ADD CONSTRAINT "nomination_agreement_id_investment_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "investment_agreement"("id");--> statement-breakpoint
ALTER TABLE "nomination" ADD CONSTRAINT "nomination_template_version_id_paper_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "paper_template_version"("id");--> statement-breakpoint
ALTER TABLE "nomination" ADD CONSTRAINT "nomination_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "nomination_paper" ADD CONSTRAINT "nomination_paper_nomination_id_nomination_id_fkey" FOREIGN KEY ("nomination_id") REFERENCES "nomination"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "nomination_paper" ADD CONSTRAINT "nomination_paper_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "nominee" ADD CONSTRAINT "nominee_nomination_id_nomination_id_fkey" FOREIGN KEY ("nomination_id") REFERENCES "nomination"("id") ON DELETE CASCADE;