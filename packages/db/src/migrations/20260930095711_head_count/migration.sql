CREATE TABLE "head_count" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"pen_id" text NOT NULL,
	"instance_id" text NOT NULL,
	"completion_id" text NOT NULL,
	"counted" integer NOT NULL,
	"expected" integer NOT NULL,
	"expected_ids" jsonb NOT NULL,
	"counted_at" timestamp NOT NULL,
	"counted_by" text NOT NULL,
	"recorded_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "head_count_completion_uidx" ON "head_count" ("completion_id");--> statement-breakpoint
CREATE INDEX "head_count_farm_idx" ON "head_count" ("farm_id","counted_at");--> statement-breakpoint
ALTER TABLE "head_count" ADD CONSTRAINT "head_count_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "head_count" ADD CONSTRAINT "head_count_pen_id_pen_id_fkey" FOREIGN KEY ("pen_id") REFERENCES "pen"("id");--> statement-breakpoint
ALTER TABLE "head_count" ADD CONSTRAINT "head_count_instance_id_sop_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "sop_instance"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "head_count" ADD CONSTRAINT "head_count_completion_id_step_completion_id_fkey" FOREIGN KEY ("completion_id") REFERENCES "step_completion"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "head_count" ADD CONSTRAINT "head_count_counted_by_user_id_fkey" FOREIGN KEY ("counted_by") REFERENCES "user"("id");