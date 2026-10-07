CREATE TABLE "server_locale" (
	"id" text PRIMARY KEY,
	"currency" text NOT NULL,
	"time_zone" text NOT NULL,
	"year_starts" integer NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL
);
