CREATE TABLE "email_code" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"investor_id" text NOT NULL,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "investor" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "investor" ADD COLUMN "email_confirmed_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "email_code_investor_uidx" ON "email_code" ("investor_id");--> statement-breakpoint
ALTER TABLE "email_code" ADD CONSTRAINT "email_code_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "email_code" ADD CONSTRAINT "email_code_investor_id_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investor"("id");