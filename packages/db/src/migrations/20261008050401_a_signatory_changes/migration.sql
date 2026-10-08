ALTER TABLE "investor_access" DROP CONSTRAINT "investor_access_revoked_why_known";--> statement-breakpoint
ALTER TABLE "investor_access" ADD CONSTRAINT "investor_access_revoked_why_known" CHECK ("revoked_why" IN ('withdrew_consent', 'lost_phone', 'owner', 'signatory_changed'));--> statement-breakpoint
ALTER TABLE "portal_consent" DROP CONSTRAINT "portal_consent_withdrawn_how_known";--> statement-breakpoint
ALTER TABLE "portal_consent" ADD CONSTRAINT "portal_consent_withdrawn_how_known" CHECK ("withdrawn_how" IN ('letter', 'message', 'signatory_changed'));
