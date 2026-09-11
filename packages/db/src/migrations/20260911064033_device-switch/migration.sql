CREATE TABLE "device_switch" (
	"id" text PRIMARY KEY,
	"device_id" text NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_pin" ADD COLUMN "id" text;--> statement-breakpoint
ALTER TABLE "staff_pin" DROP CONSTRAINT "staff_pin_pkey";--> statement-breakpoint
ALTER TABLE "staff_pin" ADD PRIMARY KEY ("id");--> statement-breakpoint
CREATE UNIQUE INDEX "device_switch_token_uidx" ON "device_switch" ("token_hash");--> statement-breakpoint
CREATE INDEX "device_switch_device_idx" ON "device_switch" ("device_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shed_phone_code_uidx" ON "shed_phone" ("enrolment_code");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_pin_user_farm_uidx" ON "staff_pin" ("user_id","farm_id");--> statement-breakpoint
ALTER TABLE "device_switch" ADD CONSTRAINT "device_switch_device_id_shed_phone_id_fkey" FOREIGN KEY ("device_id") REFERENCES "shed_phone"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "device_switch" ADD CONSTRAINT "device_switch_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;