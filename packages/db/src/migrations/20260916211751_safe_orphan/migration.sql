CREATE TABLE "password_code" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"user_id" text NOT NULL,
	"code_hash" text NOT NULL,
	"issued_by" text NOT NULL,
	"issued_by_role" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "password_code_user_uidx" ON "password_code" ("user_id");--> statement-breakpoint
ALTER TABLE "password_code" ADD CONSTRAINT "password_code_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "password_code" ADD CONSTRAINT "password_code_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "password_code" ADD CONSTRAINT "password_code_issued_by_user_id_fkey" FOREIGN KEY ("issued_by") REFERENCES "user"("id");