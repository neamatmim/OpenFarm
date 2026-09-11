DROP INDEX "push_endpoint_uidx";--> statement-breakpoint
CREATE UNIQUE INDEX "push_endpoint_uidx" ON "push_subscription" ("farm_id","endpoint");