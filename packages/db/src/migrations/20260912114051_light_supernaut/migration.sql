CREATE TABLE "text_message" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"kind" text NOT NULL,
	"entity_id" text NOT NULL,
	"user_id" text,
	"sent_to" text NOT NULL,
	"delivered" boolean NOT NULL,
	"sent_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "text_message_once_uidx" ON "text_message" ("user_id","kind","entity_id");--> statement-breakpoint
CREATE INDEX "text_message_farm_idx" ON "text_message" ("farm_id","sent_at");--> statement-breakpoint
ALTER TABLE "text_message" ADD CONSTRAINT "text_message_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "text_message" ADD CONSTRAINT "text_message_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL;