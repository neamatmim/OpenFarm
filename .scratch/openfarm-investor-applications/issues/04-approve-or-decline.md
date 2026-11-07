# 04 — The Owner approves or declines

**What to build:** the Owner's two answers, and everything approving writes in one transaction.

**Blocked by:** 03

- [ ] **`investors.approveApplication`** (Owner, personal session), one transaction:
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
- [ ] **Refused** when the switch or portal is off, the farm cannot text, the consent wording changed since they
      agreed it (they must agree the new one: decline and make a new link), or the person is already an Investor.
- [ ] **`investors.declineApplication`** with a line, emailed to the link's address and texted to them. The notice settles.
- [ ] **Tests**, each proved red with its guard off: an email changed on the form is not confirmed and gets no
      code; approve writes record, consent, access and sends one text; the
      first-code rule still refuses a code by text to an Investor met in person; changed wording refuses; declined
      cannot be approved; nothing half-written when the text fails (the code is sent after the commit, and a failed
      send leaves `sendNewCode` to try again).
