# 05 — The papers

**What to build:** every paper an Organization signs or receives names it as the Investor and its Signatory as the one
signing for it, and leaves out what is a person's.

**Blocked by:** 03

**Status:** done (2026-10-08), on feat/organization-investors

- [x] **`PaperInvestor`** carries `kind` and, for an Organization, its details and Signatory. `investorRows` prints
      Organization, Address, Trade license, RJSC no., TIN, Authority, then "Represented by" Signatory name, role, NID,
      mobile. `signingOrder`: "for and on behalf of <Org> — <Signatory>, <role>". `othersNamedOnly` still finds the
      reader on an Amendment (it matches name + mobile; both are still printed).
- [x] **Standard wording, a new Version of each affected template:** PARTIES names an Organization party; the
      Nominee clauses, `NO_NOMINEE_LINE`, `HEIRS_CLAUSE` and the death-while-Monthly-Sums clause print only for a
      person (`only:` as `farm_capital` does) and an Organization gets one line instead — its share is its own, a change
      of Signatory changes nothing, winding up is dealt with by the law it was formed under. Portal Consent in the
      Signatory's first person "for and on behalf of". Farms on the older standard wording are caught up, as on
      2026-10-02. The Owner records the lawyer's approval on the Versions themself.
- [x] **Investor Statements:** যোগদানপত্র prints the Organization's rows and no Nominees; অগ্রগতি and হিসাব নিকাশ
      name the Organization. Welcome Letter as 04 says.
- [x] **Data Copy** (`data-copy.ts`): "Your record" lists the Organization's details and the Signatory, no Nominees.
- [x] **Tests:** each paper for an Organization has no NID-of-its-own row, no Nominee line, the Signatory's signature
      line; a person's papers are unchanged (compare against the paper before this ticket).

**Not here:** —

## Design (2026-10-08, before building)

- **Two new paper conditions, `a_person` and `an_organization`** beside `by_the_month` / `farm_capital`
  (`PAPER_CONDITIONS`, `PaperFor.organization`), so the Owner's own wording can say a line is for one kind only and
  the template editor shows it as it shows the others. `only` stays one condition; SUMS_AFTER_DEATH (already
  `by_the_month`) is about a person dying, so it becomes `by_the_month` + checked against `a_person` by making `only`
  accept a list — or, simpler, the line is left as it is and the wording "the Investor dies" is read as not arising for
  an Organization. **Pick the list** if the editor change is small; else ask the Owner.
- **Standard wording, a new Version of each:** HEIRS_CLAUSE and NOMINEE_RULES `only: "a_person"`; one new clause
  `only: "an_organization"` — its share is its own, a change of Signatory changes nothing in the Agreement, and a
  winding-up is settled with whoever the law says acts for it. DATA clause: a person's list of fields is a person's; an
  Organization's line names its papers and its Signatory. Catch-up as on 2026-10-02/05: a farm still on exactly the
  previous standard is moved on; a farm that changed it keeps its own.
- **Parties rows are the farm's facts, not wording** (`investorRows`): an Organization prints Name (its name), Address,
  Trade license, RJSC no., TIN, then Signatory (name, role), Phone (the Signatory's mobile), NID (the Signatory's),
  Authority. "Name" and "Phone" keep their English labels so `othersNamedOnly` still finds the reader. No Nominee table,
  lines or no-nominee line under an Organization.
- **Signature line** (`signingOrder`): "<Signatory>, <role> — for and on behalf of <Organization>".
- **Portal Consent:** its preamble is first person and cannot be conditional per line. New fields `signatoryName`,
  `signatoryRole`; for an Organization the standard preamble reads "আমি, {signatoryName}, {investorName}-এর পক্ষে…".
  Needs either a second preamble or a field that fills to "{investorName}" for a person and "<signatory>, for
  <organization>" for an Organization — **take the field (`whoSigns`)**, no editor change.

**As built:** `PAPER_CONDITIONS` gains `a_person` / `an_organization`; a line's `only` may be one condition or a list
that must all hold (`PrintedOnly`, `conditionsOf`; the wire and the template editor take both, each condition said
in words — the editor used to say "only by the month" of the Farm-capital clause too). `wordingFor`'s `organization`
left out means a person's paper; `paperFrom` also drops the other kind's lines by who the parties are
(`kindsOnThePaper`), for papers that never pass `wordingFor` (consent). `investorRows` prints an Organization's papers
and its Signatory ("Name" and "Phone" kept so `othersNamedOnly` still finds the reader); no Nominee table or lines under
one; the signature line is "<Signatory>, <role>" for "<role> — <Organization>-এর পক্ষে / for and on behalf of".
New field `signerName`. New standard Agreement (`STANDARD_AGREEMENT_WITH_FARM_CAPITAL` kept whole): heirs, Nominee rules
and the data clause `a_person`, SUMS_AFTER_DEATH `["by_the_month","a_person"]`, ORGANIZATION_CLAUSE and
ORGANIZATION_DATA. New standard consent (`PORTAL_CONSENT_BEFORE_ORGANIZATIONS` kept whole): `{signerName}` opening,
the shows/holds clauses for each kind. `catchUpTheStandard(kind)` generalises the 2026-10-05 catch-up to both kinds.
যোগদানপত্র names the Organization and Signatory; Welcome Letter names "<Signatory> (<Organization>)"; Data Copy lists
an Organization's lines, no Nominees section, and its trail fields. Tests: `routers/organization-papers.test.ts`,
`domain/organization-wording.test.ts` (a person's paper equals the old standard's to the letter); guards proved red.
On the seed farm the Agreement caught up to Version 3, "not yet approved by a lawyer" — the Owner records it again.
