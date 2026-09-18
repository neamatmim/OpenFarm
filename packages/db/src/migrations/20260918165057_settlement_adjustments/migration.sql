CREATE TABLE "venture_settlement_adjustment" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"settlement_id" text NOT NULL,
	"reason" text NOT NULL,
	"profit_bdt" numeric(12,2) NOT NULL,
	"per_unit_bdt" numeric(12,2) NOT NULL,
	"per_unit_difference_bdt" numeric(12,2) NOT NULL,
	"investors_difference_bdt" numeric(12,2) NOT NULL,
	"threshold_bdt" numeric(12,2) NOT NULL,
	"outcome" text NOT NULL,
	"waived_note" text,
	"closed_at" timestamp,
	"closed_by" text,
	"raised_by" text,
	"raised_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "adjustment_threshold_bdt" integer DEFAULT 500 NOT NULL;--> statement-breakpoint
CREATE INDEX "venture_settlement_adjustment_idx" ON "venture_settlement_adjustment" ("farm_id","settlement_id");--> statement-breakpoint
ALTER TABLE "venture_settlement_adjustment" ADD CONSTRAINT "venture_settlement_adjustment_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "venture_settlement_adjustment" ADD CONSTRAINT "venture_settlement_adjustment_y7sS8RcTopy5_fkey" FOREIGN KEY ("settlement_id") REFERENCES "venture_settlement"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "venture_settlement_adjustment" ADD CONSTRAINT "venture_settlement_adjustment_closed_by_user_id_fkey" FOREIGN KEY ("closed_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "venture_settlement_adjustment" ADD CONSTRAINT "venture_settlement_adjustment_raised_by_user_id_fkey" FOREIGN KEY ("raised_by") REFERENCES "user"("id");