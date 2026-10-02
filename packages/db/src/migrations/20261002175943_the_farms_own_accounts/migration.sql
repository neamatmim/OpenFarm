CREATE TABLE "farm_account" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"number" text NOT NULL,
	"bank" text,
	"branch" text,
	"retired_at" timestamp,
	"created_by" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "handover" ADD COLUMN "from_account_id" text;--> statement-breakpoint
ALTER TABLE "handover" ADD COLUMN "to_account_id" text;--> statement-breakpoint
ALTER TABLE "money_event" ADD COLUMN "farm_account_id" text;--> statement-breakpoint
ALTER TABLE "money_event" ADD COLUMN "reference" text;--> statement-breakpoint
CREATE UNIQUE INDEX "farm_account_number_uidx" ON "farm_account" ("farm_id","kind","number");--> statement-breakpoint
CREATE UNIQUE INDEX "money_event_reference_uidx" ON "money_event" ("farm_account_id","reference");--> statement-breakpoint
ALTER TABLE "farm_account" ADD CONSTRAINT "farm_account_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "farm_account" ADD CONSTRAINT "farm_account_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "handover" ADD CONSTRAINT "handover_from_account_id_farm_account_id_fkey" FOREIGN KEY ("from_account_id") REFERENCES "farm_account"("id");--> statement-breakpoint
ALTER TABLE "handover" ADD CONSTRAINT "handover_to_account_id_farm_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "farm_account"("id");--> statement-breakpoint
ALTER TABLE "money_event" ADD CONSTRAINT "money_event_farm_account_id_farm_account_id_fkey" FOREIGN KEY ("farm_account_id") REFERENCES "farm_account"("id");