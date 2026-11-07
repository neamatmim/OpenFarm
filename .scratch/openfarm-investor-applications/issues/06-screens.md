# 06 — The screens

**What to build:** the Owner's side on /investors and the applicant's form on the Investor address.

**Blocked by:** 02, 03, 04

- [ ] **Owner, /investors**: the switch beside the others; "Make an Application Link" (name, mobile, email, person or
      Organization), emailed on making, then the address shown once with Copy, Email again and Send by text; an **Applications** tab in the DataTable
      (waiting, approved, declined, lapsed, links not used). One Application's page: the form as sent, the photos
      large enough to read the NID, the consent's proof, Approve and Decline (ConfirmDialog, a line for declining).
- [ ] **Applicant, `/apply/$token`** on the portal origin (nginx passes it; ADR 0009): `DoorScreen`, the masked mobile and "Send me a code" first, then
      the form in the Investor Details Form's order, in Bangla or English by the switch. Photos shrunk on the phone. The
      consent wording in full, then "Send me a code", the code box, and Send. After: "The farm has your application"
      and nothing else of the portal.
- [ ] **Words** in `packages/i18n`, Bangla numerals in Bangla sentences, refusals keyed.
- [ ] Open both pages in the browser, at phone width for the applicant's.
