CREATE TABLE "audit_event" (
	"id" text PRIMARY KEY,
	"farm_id" text,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"actor_id" text,
	"role_used" text,
	"device_id" text,
	"device_seq" integer,
	"recorded_at" timestamp NOT NULL,
	"received_at" timestamp NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"supersedes_id" text
);
--> statement-breakpoint
ALTER TABLE "role_assignment" ADD COLUMN "revoked_at" timestamp;--> statement-breakpoint
CREATE INDEX "audit_event_entity_idx" ON "audit_event" ("farm_id","entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_event_actor_idx" ON "audit_event" ("farm_id","actor_id","received_at");--> statement-breakpoint
CREATE INDEX "audit_event_received_idx" ON "audit_event" ("farm_id","received_at");--> statement-breakpoint
CREATE INDEX "audit_event_entity_received_idx" ON "audit_event" ("farm_id","entity","received_at");--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id");--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actor_id_user_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id");