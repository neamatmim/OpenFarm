CREATE TABLE "voided_photo" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"from" text NOT NULL,
	"source_id" text NOT NULL,
	"content_type" text NOT NULL,
	"data" text NOT NULL,
	"taken_at" timestamp with time zone NOT NULL,
	"voided_by" text,
	"voided_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "voided_photo_animal_idx" ON "voided_photo" ("animal_id");--> statement-breakpoint
ALTER TABLE "voided_photo" ADD CONSTRAINT "voided_photo_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "voided_photo" ADD CONSTRAINT "voided_photo_animal_id_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animal"("id");--> statement-breakpoint
ALTER TABLE "voided_photo" ADD CONSTRAINT "voided_photo_voided_by_user_id_fkey" FOREIGN KEY ("voided_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "voided_photo" ADD CONSTRAINT "voided_photo_from_known" CHECK ("from" IN ('death', 'sale_receipt'));
