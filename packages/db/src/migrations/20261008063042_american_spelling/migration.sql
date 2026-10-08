ALTER TABLE "investor" DROP CONSTRAINT "investor_organisation_has_a_signatory";--> statement-breakpoint
ALTER TABLE "investor" DROP CONSTRAINT "investor_person_has_no_signatory";--> statement-breakpoint
ALTER TABLE "investor" DROP CONSTRAINT "investor_kind_known";--> statement-breakpoint
UPDATE "investor" SET "kind" = 'organization' WHERE "kind" = 'organisation';--> statement-breakpoint
ALTER TABLE "investor" RENAME COLUMN "trade_licence" TO "trade_license";--> statement-breakpoint
ALTER TABLE "investor" ADD CONSTRAINT "investor_kind_known" CHECK ("kind" IN ('person', 'organization'));--> statement-breakpoint
ALTER TABLE "investor" ADD CONSTRAINT "investor_organization_has_a_signatory" CHECK ("kind" <> 'organization' or ("signatory_name" is not null and "authority" is not null and "nid" is null));--> statement-breakpoint
ALTER TABLE "investor" ADD CONSTRAINT "investor_person_has_no_signatory" CHECK ("kind" <> 'person' or num_nonnulls("trade_license", "rjsc_number", "tin", "authority", "authority_on", "signatory_name", "signatory_nid", "signatory_role") = 0);
