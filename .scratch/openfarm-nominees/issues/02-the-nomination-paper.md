# 02 — The মনোনয়নপত্র

**What to build:** The Owner writes down an Investor's new Nominees, prints a মনোনয়নপত্র from the farm's `nomination` Template, and, once it is signed in front of them, records it with the day and a photo. It becomes the list in force for all the Investor's Agreements. It is the only way a list changes outside signing an Agreement.

**Blocked by:** 01.

**Status:** ready for an agent

**Spec:** [the spec](../spec.md), user stories 7–11. See also "Recording a Nomination" and "The parties part", for the Template's new lines.

- [ ] **Template kind `nomination`** in `TEMPLATE_KINDS`, with `RULES`:
  - fields `WHO`
  - parties, clauses and signatures required; stamp refused
  - not about money; English printed; dated
  - signers: the Investor, then the Owner as «সামনে · Before»
- [ ] **The Template's parties section gains `receiverLine?` and `noNomineeLine?`.**
  - `receiverLine` is filled per minor from `{nomineeName}`, `{receiverName}` and `{receiverRelation}`, fields of that line alone, and prints only for a minor Nominee, with a signature blank.
  - `noNomineeLine` prints in place of the table.
  - Both are checked by `templateProblems` like any wording, and the Templates editor shows them under the parties part.
- [ ] **The standard `nomination` wording** comes from [the draft](../../openfarm-several-nominees/assets/05-nominee-wording-draft.md):
  - the first-person opening, «আমি, {investorName}, … মনোনীত করছি»;
  - the table and lines;
  - «আমি জানি ও মানি যে», then rules 1–5;
  - the closing sentence.

  `giveStandardTemplates` gives it to every farm.
- [ ] **`investors.nominationToSign({ id, nominees })`** is Owner-only and needs a personal session. It lays out the paper and refuses with `nomineesProblem`. It is an Export on the Investor.
- [ ] **`investors.recordNomination({ id, nominees, signedOn, photo })`** is Owner-only and needs a personal session. In one transaction it writes the Nomination, its Nominees and its photo, pinned to the Version in force, with an Audit Event naming the Nomination it replaced.
  - It refuses a retired Investor.
  - It refuses a `signedOn` in the future, or before the Nomination in force.
  - It refuses any `nomineesProblem`.
  - **Prove each guard by switching it off.**
- [ ] **Recording "no Nominee"** is allowed, and is a Nomination with no rows.
- [ ] **The Nominees block**, shared with 03:
  - up to three rows of name, relation (the shared `RELATIONS`, or in words), date of birth, phone and share;
  - a Receiver row appears once the date of birth makes the Nominee a minor on the day;
  - `nomineesProblem` is shown while typing.

  A test asserts it imports `nomineesProblem` rather than rewriting it.
- [ ] **On the Investor's Nominees section**, "নতুন মনোনয়নপত্র / New Nomination" opens the block, filled from the list in force. It leads to "Print" → the paper → "তিনি আজ সই করেছেন / They signed it" with the day and the photo.
- [ ] **The history** shows each Nomination's photo, as the Agreement's is shown.
- [ ] **The seed** records a later মনোনয়নপত্র with a photo for one seeded Investor, naming three Nominees, one a minor with a Receiver.
- [ ] **Somebody opens it:** records a Nomination for a seeded Investor from start to finish in Bangla. They see the paper by print preview with one, three and no Nominees, and see "not yet signed for" go.

## Checked before starting

- `recordConsent` / `consentSheet` in `routers/investors.ts` are the nearest pattern for a paper printed, then recorded as signed. `amend` in `routers/ventures.ts` is the pattern for a paper recorded with its photograph (`photoInput`).
- `RULES` and `partsAllowed` are in `packages/domain/src/paper-template.ts`, and the standard wordings in `standard-templates.ts`.
- `PaperDialog`'s `action` beside Print is where "They signed it" goes (readiness ticket 04 added it).
