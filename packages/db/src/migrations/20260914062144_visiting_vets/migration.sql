CREATE TABLE "vet_case" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"vet_id" text NOT NULL,
	"reason" text NOT NULL,
	"opened_by" text NOT NULL,
	"opened_at" timestamp NOT NULL,
	"closed_by" text,
	"closed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "invite" ADD COLUMN "vet_scope" text;--> statement-breakpoint
ALTER TABLE "invite" ADD COLUMN "access_until" timestamp;--> statement-breakpoint
ALTER TABLE "role_assignment" ADD COLUMN "scope" text;--> statement-breakpoint
ALTER TABLE "role_assignment" ADD COLUMN "expires_at" timestamp;--> statement-breakpoint
CREATE INDEX "vet_case_vet_idx" ON "vet_case" ("farm_id","vet_id");--> statement-breakpoint
CREATE INDEX "vet_case_animal_idx" ON "vet_case" ("animal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vet_case_open_uidx" ON "vet_case" ("animal_id","vet_id") WHERE "closed_at" is null;--> statement-breakpoint
ALTER TABLE "vet_case" ADD CONSTRAINT "vet_case_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "vet_case" ADD CONSTRAINT "vet_case_animal_id_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animal"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "vet_case" ADD CONSTRAINT "vet_case_vet_id_user_id_fkey" FOREIGN KEY ("vet_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "vet_case" ADD CONSTRAINT "vet_case_opened_by_user_id_fkey" FOREIGN KEY ("opened_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "vet_case" ADD CONSTRAINT "vet_case_closed_by_user_id_fkey" FOREIGN KEY ("closed_by") REFERENCES "user"("id");