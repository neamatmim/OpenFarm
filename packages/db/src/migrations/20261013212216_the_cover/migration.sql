CREATE TABLE "cover" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"absent_user_id" text NOT NULL,
	"cover_user_id" text NOT NULL,
	"day" text NOT NULL,
	"set_by" text NOT NULL,
	"set_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_by" text,
	CONSTRAINT "cover_not_themselves" CHECK ("absent_user_id" <> "cover_user_id"),
	CONSTRAINT "cover_day_shape" CHECK ("day" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);
--> statement-breakpoint
CREATE INDEX "cover_farm_cover_day_idx" ON "cover" ("farm_id","cover_user_id","day");--> statement-breakpoint
CREATE INDEX "cover_farm_day_idx" ON "cover" ("farm_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "cover_standing_uidx" ON "cover" ("farm_id","absent_user_id","day") WHERE "ended_at" is null;--> statement-breakpoint
ALTER TABLE "cover" ADD CONSTRAINT "cover_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cover" ADD CONSTRAINT "cover_absent_user_id_user_id_fkey" FOREIGN KEY ("absent_user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cover" ADD CONSTRAINT "cover_cover_user_id_user_id_fkey" FOREIGN KEY ("cover_user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cover" ADD CONSTRAINT "cover_set_by_user_id_fkey" FOREIGN KEY ("set_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "cover" ADD CONSTRAINT "cover_ended_by_user_id_fkey" FOREIGN KEY ("ended_by") REFERENCES "user"("id");