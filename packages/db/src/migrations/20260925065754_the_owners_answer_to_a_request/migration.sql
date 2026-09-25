ALTER TABLE "request_to_join" ADD COLUMN "answered_units" integer;--> statement-breakpoint
ALTER TABLE "request_to_join" ADD COLUMN "answer_line" text;--> statement-breakpoint
ALTER TABLE "request_to_join" ADD COLUMN "answered_by" text;--> statement-breakpoint
ALTER TABLE "request_to_join" ADD COLUMN "answered_at" timestamp;--> statement-breakpoint
ALTER TABLE "request_to_join" ADD CONSTRAINT "request_to_join_answered_by_user_id_fkey" FOREIGN KEY ("answered_by") REFERENCES "user"("id");