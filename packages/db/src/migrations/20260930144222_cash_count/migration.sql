CREATE TABLE "cash_count" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"user_id" text NOT NULL,
	"completion_id" text NOT NULL,
	"counted" numeric(12,2) NOT NULL,
	"expected" numeric(12,2) NOT NULL,
	"note" text,
	"counted_at" timestamp NOT NULL,
	"recorded_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "cash_short_tell_bdt" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "cash_count_completion_uidx" ON "cash_count" ("completion_id");--> statement-breakpoint
CREATE INDEX "cash_count_hand_idx" ON "cash_count" ("farm_id","user_id");--> statement-breakpoint
ALTER TABLE "cash_count" ADD CONSTRAINT "cash_count_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cash_count" ADD CONSTRAINT "cash_count_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "cash_count" ADD CONSTRAINT "cash_count_completion_id_step_completion_id_fkey" FOREIGN KEY ("completion_id") REFERENCES "step_completion"("id") ON DELETE CASCADE;