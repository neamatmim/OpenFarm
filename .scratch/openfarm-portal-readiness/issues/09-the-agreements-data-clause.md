# 09 — The Agreement's data clause

**What to build:** The Investment Agreement's standard wording gains a new Version with the "তথ্য / Data" section and the nominee lines. The Agreement's print dialog offers the notice beside it, so every Investor gets it at signing.

**Blocked by:** 03.

**Status:** done on `feat/agreement-data-clause`

**Spec:** [the readiness spec](../spec.md), user stories 36–37.

- [x] The standard `investment_agreement` wording has the data section after General terms and the two nominee lines beside the nominee row. It is taken from the draft.
- [x] Agreements already recorded stay pinned to their own Version.
- [x] The under-18 line prints every time.
- [x] The Agreement's print dialog offers the notice. Printing it is an Export.
- [x] Somebody records a seeded Agreement and prints it with the notice. **Done 2026-09-26 on the seed farm, as the Owner:**
  - The seed farm held Version 1. Its Owner started from the standard wording in the editor and published Version 2.
  - On সই-উত্তর যাচাই ভেঞ্চার, the Agreement to sign for ইঞ্জিনিয়ার রফিকুল ইসলাম printed six parts. «তথ্য» came fourth, and the two nominee lines sat under his nominee row.
  - «আপনার তথ্য» opened in the same dialog, in Bangla, with the seed's keepers named and Version 2 in its foot. Its Export is on him.
  - The Agreement recorded afterwards (serial DATA-CLAUSE-CHECK-1) is on Version 2. None of the farm's other ten is without a Version.
  - Print itself was not pressed, because Chrome's print dialog freezes the browser tools.

## Checked before starting

- Standard wording: `standard-templates.ts`. The Agreement row records `templateVersionId`, and `termsOf` reads the Agreement's own Version.
- The nominee is in the parties' rows (`PARTIES`). The death clause mentions the nominee already.
- Print dialog: `components/ventures/paper-dialog.tsx`.

## What was decided while building

- **The nominee lines are part of the parties section,** as an optional `nomineeLines`. They print under each Investor, after the rows the farm writes, and never under the Farm.
  - A Version worded before this change has none.
  - The editor edits them as a list, like clauses.
  - They are not among the terms a joining letter repeats, because they are about who signs.
- **The data section is a second clauses part, «তথ্য / Data».** It is placed after «শর্তাবলি», since the Investment Agreement has no "General terms".
  - The joining letter repeats it under its own heading, numbered ১–৬ as the Agreement numbers it (`termsOf`).
- **The wording is the draft's, word for word.** Clause 2 names Singapore in the text, with no `{dataHost}`, so the Agreement never waits on the keepers the way the notice does.
- **A farm that already holds a Version is not moved on its own.** The Owner takes the new standard with the editor's «মানক ভাষা থেকে শুরু করুন», then publishes.
  - The clause is a draft still before the lawyer, so wording in force changes only by the Owner's hand.
  - A farm given its wording for the first time starts on it.
- **The first printing is kept whole** as `FIRST_PRINTED_AGREEMENT`. A farm given its wording while it has Agreements with no Version gets that as Version 1, and those Agreements are recorded against it. The standard follows as Version 2.
- **The notice at signing is `investorStatements.noticeToHand`.**
  - It is Owner-only, from a personal session.
  - It is refused as `notice_unwritten` by the same rule as the portal page and the letter's back (`noticeFilling`).
  - It is an Export, `privacy_notice`, on the Investor, naming the Venture and the `wording`.
  - The Data Copy names it among their papers.
- **The dialog switches rather than nests.** A paper is printed by finding the one `#paper-document` on the screen, so a second dialog on top would print the Agreement.
- **Left as the draft has it:**
  - The confirmation line prints even for an Investor with no nominee, struck through by hand like the under-18 line.
  - The notice names the Venture the Owner was drafting for, which is not yet an Agreement.
