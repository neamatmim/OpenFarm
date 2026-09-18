CREATE TABLE "venture_settlement" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"venture_id" text NOT NULL,
	"proceeds_bdt" numeric(12,2) NOT NULL,
	"charged_bdt" numeric(12,2) NOT NULL,
	"charges" jsonb NOT NULL,
	"profit_bdt" numeric(12,2) NOT NULL,
	"investors_percent" integer NOT NULL,
	"units" integer NOT NULL,
	"investors_bdt" numeric(12,2) NOT NULL,
	"per_unit_bdt" numeric(12,2) NOT NULL,
	"rounding_bdt" numeric(12,2) NOT NULL,
	"farm_bdt" numeric(12,2) NOT NULL,
	"advance_bdt" numeric(12,2) NOT NULL,
	"capital_bdt" numeric(12,2) NOT NULL,
	"balance_bdt" numeric(12,2) NOT NULL,
	"advance_repaid_id" text,
	"farm_share_paid_id" text,
	"approved_by" text,
	"approved_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venture_settlement_share" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"settlement_id" text NOT NULL,
	"agreement_id" text NOT NULL,
	"investor_id" text NOT NULL,
	"units" integer NOT NULL,
	"capital_bdt" numeric(12,2) NOT NULL,
	"share_bdt" numeric(12,2) NOT NULL,
	"payout_bdt" numeric(12,2) NOT NULL,
	"paid_movement_id" text,
	"acknowledged_at" timestamp,
	"acknowledged_note" text,
	"acknowledged_by" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "venture_settlement_uidx" ON "venture_settlement" ("farm_id","venture_id");--> statement-breakpoint
CREATE UNIQUE INDEX "venture_settlement_share_uidx" ON "venture_settlement_share" ("settlement_id","agreement_id");--> statement-breakpoint
ALTER TABLE "venture_settlement" ADD CONSTRAINT "venture_settlement_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "venture_settlement" ADD CONSTRAINT "venture_settlement_venture_id_venture_id_fkey" FOREIGN KEY ("venture_id") REFERENCES "venture"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "venture_settlement" ADD CONSTRAINT "venture_settlement_approved_by_user_id_fkey" FOREIGN KEY ("approved_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "venture_settlement_share" ADD CONSTRAINT "venture_settlement_share_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "venture_settlement_share" ADD CONSTRAINT "venture_settlement_share_Dh37gtygsBKV_fkey" FOREIGN KEY ("settlement_id") REFERENCES "venture_settlement"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "venture_settlement_share" ADD CONSTRAINT "venture_settlement_share_JdMkwxhMgpKn_fkey" FOREIGN KEY ("agreement_id") REFERENCES "investment_agreement"("id");--> statement-breakpoint
ALTER TABLE "venture_settlement_share" ADD CONSTRAINT "venture_settlement_share_acknowledged_by_user_id_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "user"("id");