CREATE TABLE "application_link" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"made_by" text NOT NULL,
	"made_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"sent_by_email" text,
	"sent_by_sms" text,
	"withdrawn_at" timestamp with time zone,
	"withdrawn_by" text,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "investor_applications" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "application_link_token_uidx" ON "application_link" ("token_hash");--> statement-breakpoint
CREATE INDEX "application_link_phone_idx" ON "application_link" ("farm_id","phone");--> statement-breakpoint
CREATE INDEX "application_link_open_idx" ON "application_link" ("farm_id","made_at") WHERE "withdrawn_at" is null and "used_at" is null;--> statement-breakpoint
ALTER TABLE "application_link" ADD CONSTRAINT "application_link_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "application_link" ADD CONSTRAINT "application_link_made_by_user_id_fkey" FOREIGN KEY ("made_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "application_link" ADD CONSTRAINT "application_link_withdrawn_by_user_id_fkey" FOREIGN KEY ("withdrawn_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "application_link" ADD CONSTRAINT "application_link_kind_known" CHECK ("kind" IN ('person', 'organization'));
