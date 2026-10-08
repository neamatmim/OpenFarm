ALTER TABLE "investor" ADD COLUMN "kind" text DEFAULT 'person' NOT NULL;--> statement-breakpoint
ALTER TABLE "investor" ADD COLUMN "trade_licence" text;--> statement-breakpoint
ALTER TABLE "investor" ADD COLUMN "rjsc_number" text;--> statement-breakpoint
ALTER TABLE "investor" ADD COLUMN "tin" text;--> statement-breakpoint
ALTER TABLE "investor" ADD COLUMN "authority" text;--> statement-breakpoint
ALTER TABLE "investor" ADD COLUMN "authority_on" text;--> statement-breakpoint
ALTER TABLE "investor" ADD COLUMN "signatory_name" text;--> statement-breakpoint
ALTER TABLE "investor" ADD COLUMN "signatory_nid" text;--> statement-breakpoint
ALTER TABLE "investor" ADD COLUMN "signatory_role" text;--> statement-breakpoint
ALTER TABLE "investor" ADD CONSTRAINT "investor_organisation_has_a_signatory" CHECK ("kind" <> 'organisation' or ("signatory_name" is not null and "authority" is not null and "nid" is null));--> statement-breakpoint
ALTER TABLE "investor" ADD CONSTRAINT "investor_person_has_no_signatory" CHECK ("kind" <> 'person' or num_nonnulls("trade_licence", "rjsc_number", "tin", "authority", "authority_on", "signatory_name", "signatory_nid", "signatory_role") = 0);--> statement-breakpoint
ALTER TABLE "investor" ADD CONSTRAINT "investor_authority_on_day" CHECK ("authority_on" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');--> statement-breakpoint
ALTER TABLE "investor" ADD CONSTRAINT "investor_kind_known" CHECK ("kind" IN ('person', 'organisation'));
