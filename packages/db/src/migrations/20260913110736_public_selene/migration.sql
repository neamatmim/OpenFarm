CREATE TABLE "farm_certificate" (
	"farm_id" text PRIMARY KEY,
	"content_type" text NOT NULL,
	"data" text NOT NULL,
	"updated_by" text,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registration_renewal" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"completion_id" text NOT NULL,
	"previous_expires_on" timestamp,
	"expires_on" timestamp NOT NULL,
	"renewed_by" text,
	"renewed_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sop_instance" ALTER COLUMN "pen_id" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "registration_renewal_completion_uidx" ON "registration_renewal" ("completion_id");--> statement-breakpoint
ALTER TABLE "farm_certificate" ADD CONSTRAINT "farm_certificate_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "farm_certificate" ADD CONSTRAINT "farm_certificate_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "registration_renewal" ADD CONSTRAINT "registration_renewal_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "registration_renewal" ADD CONSTRAINT "registration_renewal_renewed_by_user_id_fkey" FOREIGN KEY ("renewed_by") REFERENCES "user"("id");