CREATE TABLE "dispatch" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"dispatched_at" timestamp NOT NULL,
	"litres" numeric(10,2) NOT NULL,
	"buyer_id" text NOT NULL,
	"buyer_name" text NOT NULL,
	"buyer_address" text,
	"challan" text,
	"price_per_litre_bdt" numeric(8,2) NOT NULL,
	"fat_percent" numeric(4,2),
	"snf_percent" numeric(4,2),
	"note" text,
	"recorded_by" text,
	"recorded_by_role" text NOT NULL,
	"recorded_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "dispatch_farm_idx" ON "dispatch" ("farm_id","dispatched_at");--> statement-breakpoint
ALTER TABLE "dispatch" ADD CONSTRAINT "dispatch_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "dispatch" ADD CONSTRAINT "dispatch_buyer_id_counterparty_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "counterparty"("id");--> statement-breakpoint
ALTER TABLE "dispatch" ADD CONSTRAINT "dispatch_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");