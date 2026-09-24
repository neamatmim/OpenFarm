CREATE TABLE "investor_access" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"investor_id" text NOT NULL,
	"user_id" text,
	"login_email" text NOT NULL,
	"code_hash" text,
	"code_expires_at" timestamp,
	"invited_by" text,
	"invited_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"revoked_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "investor_portal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "investor_access_investor_uidx" ON "investor_access" ("investor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "investor_access_login_uidx" ON "investor_access" ("login_email");--> statement-breakpoint
ALTER TABLE "investor_access" ADD CONSTRAINT "investor_access_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "investor_access" ADD CONSTRAINT "investor_access_investor_id_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investor"("id");--> statement-breakpoint
ALTER TABLE "investor_access" ADD CONSTRAINT "investor_access_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "investor_access" ADD CONSTRAINT "investor_access_invited_by_user_id_fkey" FOREIGN KEY ("invited_by") REFERENCES "user"("id");