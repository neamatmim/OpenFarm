CREATE TABLE "needs_review" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"reason" text NOT NULL,
	"audit_event_id" text NOT NULL,
	"raised_at" timestamp NOT NULL,
	"resolved_at" timestamp,
	"resolved_by" text,
	"resolution" text
);
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "staff_correction_hours" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "manager_correction_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
CREATE INDEX "needs_review_open_idx" ON "needs_review" ("farm_id","resolved_at","raised_at");--> statement-breakpoint
CREATE INDEX "needs_review_entity_idx" ON "needs_review" ("entity","entity_id");--> statement-breakpoint
ALTER TABLE "needs_review" ADD CONSTRAINT "needs_review_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
-- Deferred on purpose: a Correction raises its own Needs Review inside the Correction's
-- transaction, and the Audit Event it points at is written at the end of that transaction —
-- last, so that a write which throws leaves no trail entry claiming it happened. Checking
-- this constraint at commit rather than at insert is what lets the two live together.
ALTER TABLE "needs_review" ADD CONSTRAINT "needs_review_audit_event_id_audit_event_id_fkey" FOREIGN KEY ("audit_event_id") REFERENCES "audit_event"("id") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "needs_review" ADD CONSTRAINT "needs_review_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by") REFERENCES "user"("id");