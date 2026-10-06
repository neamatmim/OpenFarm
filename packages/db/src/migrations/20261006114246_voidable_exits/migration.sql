ALTER TABLE "sale" ADD COLUMN "state_before" text;--> statement-breakpoint
ALTER TABLE "sale" ADD COLUMN "state_changed_before" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mortality" ADD COLUMN "state_before" text;--> statement-breakpoint
ALTER TABLE "mortality" ADD COLUMN "state_changed_before" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_state_before_known" CHECK ("state_before" IN ('calf', 'heifer', 'pregnant_heifer', 'milking', 'dry', 'quarantine', 'fattening', 'ready_for_sale', 'sold', 'died', 'culled', 'lost'));--> statement-breakpoint
ALTER TABLE "mortality" ADD CONSTRAINT "mortality_state_before_known" CHECK ("state_before" IN ('calf', 'heifer', 'pregnant_heifer', 'milking', 'dry', 'quarantine', 'fattening', 'ready_for_sale', 'sold', 'died', 'culled', 'lost'));