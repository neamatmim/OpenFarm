# 06 — The screens

**What to build:** the Owner's side on /investors and the applicant's form on the Investor address.

**Blocked by:** 02, 03, 04

**Status:** done (2026-11-08)

- [x] **Owner, /investors**: the switch beside the others; "Make an Application Link" (name, mobile, email, person or
      Organization), emailed on making, then the address shown once with Copy, Email again and Send by text; an **Applications** tab in the DataTable
      (waiting, approved, declined, lapsed, links not used). One Application's page: the form as sent, the photos
      large enough to read the NID, the consent's proof, Approve and Decline (ConfirmDialog, a line for declining).
- [x] **Applicant, `/apply/$token`** on the portal origin (nginx passes it; ADR 0009): `DoorScreen`, the masked mobile and "Send me a code" first, then
      the form in the Investor Details Form's order, in Bangla or English by the switch. Photos shrunk on the phone. The
      consent wording in full, then "Send me a code", the code box, and Send. After: "The farm has your application"
      and nothing else of the portal.
- [x] **Words** in `packages/i18n`, Bangla numerals in Bangla sentences, refusals keyed.
- [x] Open both pages in the browser, at phone width for the applicant's.

**As built:** the switch on Farm settings → Portal (`ShownToInvestorsSwitch` `applications`). On /investors,
`ApplicationsSection` (`components/investors/applications.tsx`) holds the waiting Applications, the links not yet used
(email again, text, withdraw) and the ones answered lately. "Send an application link" emails the link, then shows the
address once to copy. An Application opens in a dialog with its facts, the photographs, the consent's proof, and
Approve/Decline. The applicant's page is `routes/portal/apply/$token.tsx` (drawn only in the browser, the sitting's key
in `sessionStorage`): the code, then the form in the record sheet's order (Nominees through the Owner's own
`NomineesForm`), the photographs, the consent laid out from the form, then the code to agree.

**Opened 2026-11-08** on `openfarm_seed` with a stand-in SMS gateway that only logged texts. A person: link made →
opened with the code → form → consent read → agreed with the second code → Owner read and approved it → the texted
first code took them into the portal. An organization's form looked at too, and a reload kept the sitting. Found by
opening it: the router key `apply` is a method on every JavaScript function, so `orpc.portal.apply` in the browser was
`Function.prototype.apply`. The RPC path is now `portal.applying.*`; the page stays `/portal/apply/<link>`. Also found:
the copy button said "copy code", and the approval text glued "-এ" to the address.

**Left as it is:** the door's dark side still says what the portal holds for an Investor ("your Ventures, papers and
money"), which an applicant does not have yet. The older "new code" text (`portal.sentCode.sms`) still glues "-এ" to
the address. A masked mobile shows Latin digits inside Bangla sentences, as it does elsewhere in the portal.
