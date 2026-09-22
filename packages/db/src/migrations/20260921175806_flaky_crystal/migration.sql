CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY,
	"key" text NOT NULL UNIQUE,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduler_state" (
	"id" text PRIMARY KEY,
	"last_ran_at" timestamp NOT NULL,
	"last_ok_at" timestamp,
	"last_error" text
);
