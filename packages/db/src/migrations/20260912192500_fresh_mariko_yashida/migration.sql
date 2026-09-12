ALTER TABLE "farm" ADD COLUMN "ai_window_start_hours" integer DEFAULT 12 NOT NULL;--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "ai_window_end_hours" integer DEFAULT 18 NOT NULL;