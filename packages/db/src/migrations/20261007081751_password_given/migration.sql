CREATE TABLE "password_given" (
	"session_id" text PRIMARY KEY,
	"given_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "password_given" ADD CONSTRAINT "password_given_session_id_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "session"("id") ON DELETE CASCADE;