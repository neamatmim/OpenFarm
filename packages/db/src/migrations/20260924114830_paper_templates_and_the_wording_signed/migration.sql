CREATE TABLE "paper_template" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"kind" text NOT NULL,
	"current_version_id" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paper_template_version" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"template_id" text NOT NULL,
	"number" integer NOT NULL,
	"content" jsonb NOT NULL,
	"note" text,
	"published_by" text,
	"published_by_role" text,
	"published_at" timestamp NOT NULL,
	"reviewed_by" text,
	"reviewed_on" text,
	"review_recorded_by" text
);
--> statement-breakpoint
ALTER TABLE "agreement_amendment" ADD COLUMN "template_version_id" text;--> statement-breakpoint
ALTER TABLE "investment_agreement" ADD COLUMN "template_version_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "paper_template_kind_uidx" ON "paper_template" ("farm_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "paper_template_version_number_uidx" ON "paper_template_version" ("template_id","number");--> statement-breakpoint
CREATE INDEX "paper_template_version_farm_idx" ON "paper_template_version" ("farm_id");--> statement-breakpoint
ALTER TABLE "paper_template" ADD CONSTRAINT "paper_template_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "paper_template_version" ADD CONSTRAINT "paper_template_version_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "paper_template_version" ADD CONSTRAINT "paper_template_version_template_id_paper_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "paper_template"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "paper_template_version" ADD CONSTRAINT "paper_template_version_published_by_user_id_fkey" FOREIGN KEY ("published_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "paper_template_version" ADD CONSTRAINT "paper_template_version_review_recorded_by_user_id_fkey" FOREIGN KEY ("review_recorded_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "agreement_amendment" ADD CONSTRAINT "agreement_amendment_SRDRvWL5gZfD_fkey" FOREIGN KEY ("template_version_id") REFERENCES "paper_template_version"("id");--> statement-breakpoint
ALTER TABLE "investment_agreement" ADD CONSTRAINT "investment_agreement_GgSY7lBgxsFz_fkey" FOREIGN KEY ("template_version_id") REFERENCES "paper_template_version"("id");