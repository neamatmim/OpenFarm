CREATE TABLE "farm" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"roles" text[] NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invited_by" text NOT NULL,
	"invited_by_role" text NOT NULL,
	"approved_by" text,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pen_assignment" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"user_id" text NOT NULL,
	"pen_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_assignment" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"granted_by" text,
	"granted_by_role" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "disabled_at" timestamp;--> statement-breakpoint
CREATE INDEX "invite_email_idx" ON "invite" ("farm_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "pen_assignment_user_pen_uidx" ON "pen_assignment" ("user_id","pen_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_assignment_user_role_uidx" ON "role_assignment" ("farm_id","user_id","role");--> statement-breakpoint
CREATE INDEX "role_assignment_user_idx" ON "role_assignment" ("user_id");--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_invited_by_user_id_fkey" FOREIGN KEY ("invited_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_approved_by_user_id_fkey" FOREIGN KEY ("approved_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "pen_assignment" ADD CONSTRAINT "pen_assignment_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pen_assignment" ADD CONSTRAINT "pen_assignment_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_granted_by_user_id_fkey" FOREIGN KEY ("granted_by") REFERENCES "user"("id");