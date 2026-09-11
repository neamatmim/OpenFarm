CREATE TABLE "backup_run" (
	"id" text PRIMARY KEY,
	"kind" text NOT NULL,
	"started_at" timestamp NOT NULL,
	"finished_at" timestamp,
	"size_bytes" text,
	"destination" text NOT NULL,
	"ok" text NOT NULL,
	"detail" text
);
--> statement-breakpoint
CREATE INDEX "backup_run_idx" ON "backup_run" ("started_at");