# 04 — The Owner approves or declines

**What to build:** the Owner's two answers, and everything approving writes in one transaction.

**Blocked by:** 03

**Status:** done (2026-11-08)

- [x] **`investors.approveApplication`** (Owner, personal session), one transaction:
  - the Investor record from the form, as `investors.record` writes it (`theSamePerson` asked again), with
    `emailConfirmedAt` set when the form's email is the one the link was emailed to and the link was sent by email;
  - the Portal Consent recorded on the version they agreed, signed on the day they sent it, with a new
    `agreed_online` proof pointing at the Application (a new column or a link table; the paper consent keeps none);
  - `investor_access` with a new code, sent by text, and by email where it counts as confirmed, as `sendNewCode` sends one. `mayBeSentACode`'s
    `first_code_in_person` refusal gives way only for an access written from an approved Application;
  - the Nominees as a Nomination offered in the portal (`offerNomination`) where the farm's switch for agreeing in
    the app is on; otherwise the Owner's page says a Nomination is still to be signed. One naming a minor is never
    offered: it stays on paper.
  - the Application reads approved, naming the Investor; the notice settles.
- [x] **Refused** when the switch or portal is off, the farm cannot text, the consent wording changed since they
      agreed it (they must agree the new one: decline and make a new link), or the person is already an Investor.
- [x] **`investors.declineApplication`** with a line, emailed to the link's address and texted to them. The notice settles.
- [x] **Tests**, each proved red with its guard off: an email changed on the form is not confirmed and gets no
      code; approve writes record, consent, access and sends one text; the
      first-code rule still refuses a code by text to an Investor met in person; changed wording refuses; declined
      cannot be approved; nothing half-written when the text fails (the code is sent after the commit, and a failed
      send leaves `sendNewCode` to try again).

**As built:** `api/src/application-answers.ts`; `investors.applications.{list,one,photo,consentPaper,approve,decline}`.
Approving writes the Investor, the `portal_consent` (signed on the day the Application was sent, on the Version agreed)
and an `investor_access` with no code yet, then sends the first code through `sendNewCode` with `first: { language }`,
which uses the `portal.apply.approved.*` words. The in-person rule is unchanged: `first_code_in_person` still refuses
anybody with no access row, and only approval writes one without a code handed over. A code that does not go leaves
them approved (`code: null`), for the Owner's "send a new code". `investor_application.consent_id` names the consent
(migration `20261107193924_application_consent`).

Not done here: the Nominees can't be offered as a Nomination at approval, because `offerNomination` needs them signed
in to the portal first (`assertInThePortal`). The draft stays on the Application, and the Investor's page offers it
once they are in (06).
