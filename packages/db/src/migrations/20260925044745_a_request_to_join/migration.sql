CREATE TABLE "request_to_join" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"venture_id" text NOT NULL,
	"investor_id" text NOT NULL,
	"units" integer NOT NULL,
	"note" text,
	"state" text DEFAULT 'waiting' NOT NULL,
	"made_by" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_to_join_change" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"request_id" text NOT NULL,
	"kind" text NOT NULL,
	"units" integer NOT NULL,
	"note" text,
	"made_by" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "request_to_join_venture_idx" ON "request_to_join" ("farm_id","venture_id");--> statement-breakpoint
CREATE UNIQUE INDEX "request_to_join_live_uidx" ON "request_to_join" ("venture_id","investor_id") WHERE "state" in ('waiting', 'come_and_sign');--> statement-breakpoint
CREATE INDEX "request_to_join_change_idx" ON "request_to_join_change" ("farm_id","request_id");--> statement-breakpoint
ALTER TABLE "request_to_join" ADD CONSTRAINT "request_to_join_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "request_to_join" ADD CONSTRAINT "request_to_join_venture_id_venture_id_fkey" FOREIGN KEY ("venture_id") REFERENCES "venture"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "request_to_join" ADD CONSTRAINT "request_to_join_investor_id_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investor"("id");--> statement-breakpoint
ALTER TABLE "request_to_join" ADD CONSTRAINT "request_to_join_made_by_user_id_fkey" FOREIGN KEY ("made_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "request_to_join_change" ADD CONSTRAINT "request_to_join_change_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "request_to_join_change" ADD CONSTRAINT "request_to_join_change_request_id_request_to_join_id_fkey" FOREIGN KEY ("request_id") REFERENCES "request_to_join"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "request_to_join_change" ADD CONSTRAINT "request_to_join_change_made_by_user_id_fkey" FOREIGN KEY ("made_by") REFERENCES "user"("id");