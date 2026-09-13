CREATE TABLE "registration_certificate" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"content_type" text NOT NULL,
	"data" text NOT NULL,
	"completion_id" text,
	"taken_by" text,
	"taken_at" timestamp NOT NULL
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
CREATE INDEX "registration_certificate_farm_idx" ON "registration_certificate" ("farm_id","taken_at");--> statement-breakpoint
CREATE UNIQUE INDEX "registration_certificate_completion_uidx" ON "registration_certificate" ("completion_id") WHERE "completion_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "registration_renewal_completion_uidx" ON "registration_renewal" ("completion_id");--> statement-breakpoint
ALTER TABLE "registration_certificate" ADD CONSTRAINT "registration_certificate_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "registration_certificate" ADD CONSTRAINT "registration_certificate_taken_by_user_id_fkey" FOREIGN KEY ("taken_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "registration_renewal" ADD CONSTRAINT "registration_renewal_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "registration_renewal" ADD CONSTRAINT "registration_renewal_renewed_by_user_id_fkey" FOREIGN KEY ("renewed_by") REFERENCES "user"("id");