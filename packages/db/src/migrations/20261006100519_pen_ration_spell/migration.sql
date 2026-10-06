CREATE TABLE "pen_ration_spell" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"pen_id" text NOT NULL,
	"ration_id" text NOT NULL,
	"from" timestamp with time zone NOT NULL,
	"until" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "pen_ration_spell_pen_idx" ON "pen_ration_spell" ("pen_id","from");--> statement-breakpoint
ALTER TABLE "pen_ration_spell" ADD CONSTRAINT "pen_ration_spell_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pen_ration_spell" ADD CONSTRAINT "pen_ration_spell_pen_id_pen_id_fkey" FOREIGN KEY ("pen_id") REFERENCES "pen"("id");--> statement-breakpoint
ALTER TABLE "pen_ration_spell" ADD CONSTRAINT "pen_ration_spell_ration_id_ration_id_fkey" FOREIGN KEY ("ration_id") REFERENCES "ration"("id");--> statement-breakpoint
-- Each Pen on the Ration it is on now, since it went on it: the history starts there.
INSERT INTO "pen_ration_spell" ("id", "farm_id", "pen_id", "ration_id", "from", "until")
SELECT gen_random_uuid()::text, "farm_id", "pen_id", "ration_id", "assigned_at", NULL FROM "pen_ration";