CREATE TABLE "completion_photo" (
	"completion_id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"content_type" text NOT NULL,
	"data" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sop_instance" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"definition_id" text NOT NULL,
	"version_id" text NOT NULL,
	"pen_id" text NOT NULL,
	"state" text DEFAULT 'due' NOT NULL,
	"due_at" timestamp NOT NULL,
	"grace_minutes" integer NOT NULL,
	"assigned_role" text NOT NULL,
	"assigned_to" text,
	"assigned_by" text,
	"claimed_by" text,
	"claimed_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "step_completion" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"instance_id" text NOT NULL,
	"step_id" text NOT NULL,
	"animal_id" text,
	"status" text NOT NULL,
	"skip_reason" text,
	"evidence" jsonb NOT NULL,
	"out_of_range" text,
	"recorded_by" text NOT NULL,
	"device_id" text,
	"recorded_at" timestamp NOT NULL,
	"received_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "sop_instance_due_uidx" ON "sop_instance" ("definition_id","pen_id","due_at");--> statement-breakpoint
CREATE INDEX "sop_instance_open_idx" ON "sop_instance" ("farm_id","state","due_at");--> statement-breakpoint
CREATE INDEX "sop_instance_pen_idx" ON "sop_instance" ("farm_id","pen_id","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "step_completion_uidx" ON "step_completion" ("instance_id","step_id","animal_id");--> statement-breakpoint
CREATE INDEX "step_completion_instance_idx" ON "step_completion" ("instance_id");--> statement-breakpoint
ALTER TABLE "completion_photo" ADD CONSTRAINT "completion_photo_completion_id_step_completion_id_fkey" FOREIGN KEY ("completion_id") REFERENCES "step_completion"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "completion_photo" ADD CONSTRAINT "completion_photo_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sop_instance" ADD CONSTRAINT "sop_instance_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sop_instance" ADD CONSTRAINT "sop_instance_definition_id_sop_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "sop_definition"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sop_instance" ADD CONSTRAINT "sop_instance_version_id_sop_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "sop_version"("id");--> statement-breakpoint
ALTER TABLE "sop_instance" ADD CONSTRAINT "sop_instance_pen_id_pen_id_fkey" FOREIGN KEY ("pen_id") REFERENCES "pen"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sop_instance" ADD CONSTRAINT "sop_instance_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "sop_instance" ADD CONSTRAINT "sop_instance_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "sop_instance" ADD CONSTRAINT "sop_instance_claimed_by_user_id_fkey" FOREIGN KEY ("claimed_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "step_completion" ADD CONSTRAINT "step_completion_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "step_completion" ADD CONSTRAINT "step_completion_instance_id_sop_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "sop_instance"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "step_completion" ADD CONSTRAINT "step_completion_animal_id_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animal"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "step_completion" ADD CONSTRAINT "step_completion_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "step_completion" ADD CONSTRAINT "step_completion_device_id_shed_phone_id_fkey" FOREIGN KEY ("device_id") REFERENCES "shed_phone"("id");