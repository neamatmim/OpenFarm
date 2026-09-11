CREATE TABLE "shed_phone" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"shed_id" text,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"enrolment_code" text,
	"enrolment_expires_at" timestamp,
	"enrolled_by" text,
	"enrolled_by_role" text,
	"claimed_at" timestamp,
	"last_seen_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_pin" (
	"user_id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"salt" text NOT NULL,
	"hash" text NOT NULL,
	"set_by" text,
	"set_by_role" text,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "pin_auto_lock_minutes" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "shed_phone_token_uidx" ON "shed_phone" ("token_hash");--> statement-breakpoint
CREATE INDEX "shed_phone_farm_idx" ON "shed_phone" ("farm_id");--> statement-breakpoint
ALTER TABLE "shed_phone" ADD CONSTRAINT "shed_phone_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "shed_phone" ADD CONSTRAINT "shed_phone_shed_id_shed_id_fkey" FOREIGN KEY ("shed_id") REFERENCES "shed"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "shed_phone" ADD CONSTRAINT "shed_phone_enrolled_by_user_id_fkey" FOREIGN KEY ("enrolled_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "staff_pin" ADD CONSTRAINT "staff_pin_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "staff_pin" ADD CONSTRAINT "staff_pin_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "staff_pin" ADD CONSTRAINT "staff_pin_set_by_user_id_fkey" FOREIGN KEY ("set_by") REFERENCES "user"("id");