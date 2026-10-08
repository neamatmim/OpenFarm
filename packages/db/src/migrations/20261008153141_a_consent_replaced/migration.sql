ALTER TABLE "portal_consent" DROP CONSTRAINT "portal_consent_withdrawn_how_known";--> statement-breakpoint
ALTER TABLE "portal_consent" ADD CONSTRAINT "portal_consent_withdrawn_how_known" CHECK ("withdrawn_how" IN ('letter', 'message', 'signatory_changed', 'replaced'));
