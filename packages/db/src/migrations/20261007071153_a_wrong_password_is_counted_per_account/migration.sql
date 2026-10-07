CREATE TABLE "password_guess" (
	"id" text PRIMARY KEY,
	"login" text NOT NULL,
	"guessed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "password_guess_login_idx" ON "password_guess" ("login","guessed_at");