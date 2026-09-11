CREATE TABLE "push_subscription" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"user_id" text NOT NULL,
	"device_id" text,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX "push_endpoint_uidx" ON "push_subscription" ("endpoint");--> statement-breakpoint
CREATE INDEX "push_user_idx" ON "push_subscription" ("farm_id","user_id","revoked_at");--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_device_id_shed_phone_id_fkey" FOREIGN KEY ("device_id") REFERENCES "shed_phone"("id") ON DELETE CASCADE;