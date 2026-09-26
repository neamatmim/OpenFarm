# 02 — The মনোনয়নপত্র

**What to build:** The Owner writes down an Investor's new Nominees, prints a মনোনয়নপত্র from the farm's `nomination` Template, and, once it is signed in front of them, records it with the day and a photo. It becomes the list in force for all the Investor's Agreements. It is the only way a list changes outside signing an Agreement.

**Blocked by:** 01.

**Status:** done on `feat/the-nomination-paper`

**Spec:** [the spec](../spec.md), user stories 7–11. See also "Recording a Nomination" and "The parties part", for the Template's new lines.

- [x] **Template kind `nomination`** in `TEMPLATE_KINDS`, with `RULES`:
  - fields `WHO`
  - parties, clauses and signatures required; stamp refused
  - not about money; English printed; dated
  - signers: the Investor, then the Owner as «সামনে · Before»
- [x] **The Template's parties section gains `receiverLine?` and `noNomineeLine?`.**
  - `receiverLine` is filled per minor from `{nomineeName}`, `{receiverName}` and `{receiverRelation}`, fields of that line alone, and prints only for a minor Nominee, with a signature blank.
  - `noNomineeLine` prints in place of the table.
  - Both are checked by `templateProblems` like any wording, and the Templates editor shows them under the parties part.
- [x] **The standard `nomination` wording** comes from [the draft](../../openfarm-several-nominees/assets/05-nominee-wording-draft.md):
  - the first-person opening, «আমি, {investorName}, … মনোনীত করছি»;
  - the table and lines;
  - «আমি জানি ও মানি যে», then rules 1–5;
  - the closing sentence.

  `giveStandardTemplates` gives it to every farm.
- [x] **`investors.nominationToSign({ id, nominees })`** is Owner-only and needs a personal session. It lays out the paper and refuses with `nomineesProblem`. It is an Export on the Investor.
- [x] **`investors.recordNomination({ id, nominees, signedOn, photo })`** is Owner-only and needs a personal session. In one transaction it writes the Nomination, its Nominees and its photo, pinned to the Version in force, with an Audit Event naming the Nomination it replaced.
  - It refuses a retired Investor.
  - It refuses a `signedOn` in the future, or before the Nomination in force.
  - It refuses any `nomineesProblem`.
  - **Prove each guard by switching it off.**
- [x] **Recording "no Nominee"** is allowed, and is a Nomination with no rows.
- [x] **The Nominees block**, shared with 03:
  - up to three rows of name, relation (the shared `RELATIONS`, or in words), date of birth, phone and share;
  - a Receiver row appears once the date of birth makes the Nominee a minor on the day;
  - `nomineesProblem` is shown while typing.

  A test asserts it imports `nomineesProblem` rather than rewriting it.
- [x] **On the Investor's Nominees section**, "নতুন মনোনয়নপত্র / New Nomination" opens the block, filled from the list in force. It leads to "Print" → the paper → "তিনি আজ সই করেছেন / They signed it" with the day and the photo.
- [x] **The history** says «ছবি রাখা আছে» (photo kept) for each Nomination with its photo. The Agreement's photo is only ever said to be kept, never shown, so the মনোনয়নপত্র's is the same.
- [x] **The seed** records a later মনোনয়নপত্র with a photo for one seeded Investor, naming three Nominees, one a minor with a Receiver.
- [x] **Somebody opens it:** records a Nomination for a seeded Investor from start to finish in Bangla. They see the paper by print preview with one, three and no Nominees, and see "not yet signed for" go.

## Checked before starting

- `recordConsent` / `consentSheet` in `routers/investors.ts` are the nearest pattern for a paper printed, then recorded as signed. `amend` in `routers/ventures.ts` is the pattern for a paper recorded with its photograph (`photoInput`).
- `RULES` and `partsAllowed` are in `packages/domain/src/paper-template.ts`, and the standard wordings in `standard-templates.ts`.
- `PaperDialog`'s `action` beside Print is where "They signed it" goes (readiness ticket 04 added it).

## What was decided while building

- **The paper:**
  - The standard `nomination` wording opens «আমি, {investorName}, … কে সংগ্রহ করে … বুঝিয়ে দেবেন, তা নিচে লিখে দিচ্ছি» ("I set out below who is to collect …"), not the draft's «নিচের <n> জনকে … মনোনীত করছি». That way it reads right for a paper naming nobody, and the wording needs no count field.
  - The closing sentence («এই মনোনয়নপত্র আমার আগের সব …») is the last clause. The signatures part carries the dates.
- **Signers:** `signersOf` now takes a kind's own `RULES.signers` before the parties part's roles. It changes nothing for the kinds before, since none of them had both. The মনোনয়নপত্র is signed by the Investor first, then «সামনে — মালিক / Before — the Owner», dated, with no witnesses.
- **The parties part in the domain:**
  - `receiverLine` fills `RECEIVER_FIELDS` (`nomineeName`, `receiverName`, `receiverRelation`), which no other wording may use (`templateProblems` refuses them elsewhere).
  - `noNomineeLine` replaces the table and lines only when the Version has one. A Version without these lines prints as before.
  - The rules live in `linesUnder` in `paper-template.ts`. `NOMINEE_RULES`, `EACH_NOMINEE_KNOWS`, `RECEIVER_LINE` and `NO_NOMINEE_LINE` are in `standard-templates.ts`, ready for 04.
- **The server:**
  - Everything is in `packages/api/src/nominations.ts`.
  - `nominationToSign` returns `{ document, wording }` like `agreementToSign`, so the dialog says the lawyer hasn't approved it.
  - `recordNomination` writes an Audit Event `entity: "nomination"`, `entityId: investorId`. It snapshots the list in force before and after as `{ signedOn, nominationHow, nominees }` through `readNominees`. The Data Copy's `TRAILED.nomination` reads it, and the Data Copy test now records through the router to prove it.
  - Refusals: `nominees_<code>` (with `at`), `signed_in_future`, `signed_before_in_force`, `investor_retired`. All are worded in `correction-refusal.ts`.
  - The wire takes up to four Nominees, so a fourth is the domain's `too_many` rather than a zod error.
- **The web:**
  - `nominee-draft.ts` holds the logic: rows ↔ Nominees, a Receiver sent only for a minor on the day, and `draftsProblem` = `nomineesProblem`.
  - `nominees-form.tsx` is the block, `nomination-sheet.tsx` the sheet. The sheet judges minors on the day typed as signed, and prints on today.
  - The twin test reads both files' source: the form uses `draftsProblem`, and neither holds its own 100 or 3.
- **Templates page:** the kind is «মনোনয়নপত্র (Nomination)» and is marked as waiting on the lawyer. The editor shows the Receiver's and no-Nominee lines under the parties part, and an empty one isn't published.
- **Proven by switching off:** the retired, future-day, before-in-force and Nominee-rule guards each turned a test red.
- **Opened on the seed farm (in English):**
  - আবুল হাশেম মিয়া's "New মনোনয়নপত্র" sheet opened with রোকেয়া carried over, and warned that her date of birth was missing.
  - I added a son and a minor daughter, and the Receiver's boxes appeared for the daughter.
  - The paper, in the paper dialog, showed the table, the Receiver's line for the minor only, the five rules and the closing, and the Investor signing first with the Owner «সামনে — মালিক».
  - I recorded it with a photo. The page showed "মনোনয়নপত্র signed 26 September 2026 · Photo kept", and "not yet signed for" went.
  - The Templates page lists the kind, and the editor shows both lines.
- **Docker (OrbStack) stopped** during the first full API run, which then skipped every file after that point. OrbStack was restarted and the suite rerun.
