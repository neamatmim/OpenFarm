CREATE TABLE "dairy_entry_price" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"price_bdt" integer NOT NULL,
	"as_of" text NOT NULL,
	"note" text NOT NULL,
	"set_by" text,
	"set_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "head_price" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"kind" text NOT NULL,
	"low_bdt" integer NOT NULL,
	"high_bdt" integer NOT NULL,
	"set_by" text,
	"set_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "dairy_entry_price_animal_uidx" ON "dairy_entry_price" ("animal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "head_price_kind_uidx" ON "head_price" ("farm_id","kind");--> statement-breakpoint
ALTER TABLE "dairy_entry_price" ADD CONSTRAINT "dairy_entry_price_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "dairy_entry_price" ADD CONSTRAINT "dairy_entry_price_animal_id_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animal"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "dairy_entry_price" ADD CONSTRAINT "dairy_entry_price_set_by_user_id_fkey" FOREIGN KEY ("set_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "head_price" ADD CONSTRAINT "head_price_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "head_price" ADD CONSTRAINT "head_price_set_by_user_id_fkey" FOREIGN KEY ("set_by") REFERENCES "user"("id");