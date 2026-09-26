# An Investor names several Nominees — spec

**Source:** the map [OpenFarm: an Investor may name several Nominees](../openfarm-several-nominees/map.md). All six of its tickets were decided with the Owner on 2026-09-26:

- [What a nominee is in Bangladeshi law and in Shariah](../openfarm-several-nominees/issues/01-what-a-nominee-is-in-bangladeshi-law-and-in-shariah.md) (research)
- [What a Nominee is in OpenFarm](../openfarm-several-nominees/issues/02-what-a-nominee-is-in-openfarm.md)
- [How several Nominees stand together](../openfarm-several-nominees/issues/03-how-several-nominees-stand-together.md)
- [Which Nominees a signed Agreement names](../openfarm-several-nominees/issues/04-which-nominees-a-signed-agreement-names.md)
- [Prototype the Agreement's parties part with several Nominees](../openfarm-several-nominees/issues/05-prototype-the-agreement-with-several-nominees.md)
- [Add the Nominees to the pending lawyer meeting](../openfarm-several-nominees/issues/06-add-the-nominees-to-the-pending-lawyer-meeting.md)

**Vocabulary** is in `CONTEXT.md`: **Nominee**, **Nomination**, **Receiver**, **Investor**, **Investment Agreement**, **Template**, **Data Copy**, **Portal Consent**.

**Wording:** [`05-nominee-wording-draft.md`](../openfarm-several-nominees/assets/05-nominee-wording-draft.md). The printed layout is variant D of the prototype on branch `prototype/several-nominees` (`/prototype/nominees?variant=D&case=none|one|three`).

**Status:** ready for an agent. Tickets are in [README.md](./README.md).

---

## Problem Statement

An Investor can name exactly one nominee today, as three free-text fields on their record. The Owner types it in and changes it at will, and nothing the Investor signed backs the change. That falls short in four ways:

- **One is not enough.** Families want two or three people able to collect, and the market allows it: CDBL 2, savings certificates 2, MetLife 3.
- **The paper doesn't say what a nominee is.** The Agreement's heirs clause says the money is paid "through their nominee to their lawful heirs", and nothing more:
  - nothing on who collects which part;
  - nothing on a nominee who dies first;
  - nothing on a child nominee's money.
- **A minor nominee has only a data-consent line.** It is printed every time and struck through by hand. The farm records no age, and nobody is named to receive a child's part, which every statute provides for.
- **Nothing the Investor signed backs a change.** Whatever the Owner last typed is the nominee, and the farm has nothing to show a family that the Investor chose these people.

## Solution

An Investor names **none, or up to three Nominees**. Each has a whole-percent **share of the collecting** that adds to 100 with the others', and a date of birth. A Nominee under eighteen has a named **Receiver**.

The list changes only by a paper the Investor signs: a **Nomination** (মনোনয়নপত্র), or the **Investment Agreement** itself, which names the Nominees it was signed with.

- The latest one recorded is the **list in force** for all the Investor's Agreements.
- Every paper and screen that describes the Investor today shows that list.
- The Agreement's parties part prints a Nominee table. The Terms print the five rules once, and the Nomination prints them in full.
- The standard wording ships as OpenFarm's draft, for the lawyer at the pending meeting. The Owner publishes it as a Version when it is approved.

## User Stories

### Nominees and the list in force

1. As the Owner, I want an Investor's page to show their Nominees in force, with relation, date of birth, phone and share, so that I can see at a glance who collects what.
2. As the Owner, I want a Nominee under eighteen marked as a minor, with their Receiver beside them, so that I know who collects that child's part.
3. As the Owner, I want the page to tell me where the list in force came from, so that I can find the paper if a family asks. It names the Nomination or the Agreement it came from, with its day and photo.
4. As the Owner, I want a list that was never signed for marked **not yet signed for**, so that I get it signed at the next chance. This is a list carried over from before Nominations, or typed for a new Investor and not yet printed on a signed paper.
5. As the Owner, I want every earlier Nomination kept and listed, newest first, so that the history of who was named, and when, is never lost.
6. As the Owner, I want an Investor with no Nominee shown plainly as "no Nominee", so that I can raise it with them. It is never an error.

### A Nomination

7. As the Owner, I want to write down an Investor's new list and print a মনোনয়নপত্র from it, so that they can sign it in front of me.
8. As the Owner, I want the list checked before it prints:
   - at most three Nominees;
   - whole percents adding to 100;
   - a date of birth for each;
   - a Receiver for each minor;
   - no Receiver on an adult.

   The problem shows while I am still typing.

9. As the Owner, I want to record the signed Nomination with its day and a photo of it, so that it becomes the list in force for all their Agreements.
10. As the Owner, I want recording a Nomination for "no Nominee" to be possible, so that an Investor who takes their Nominees off does it on paper too.
11. As the Owner, I want the মনোনয়নপত্র printed from the farm's Template, with the lawyer's approval recorded on its Version like every other paper, so that its wording is the farm's and is checked.

### The Investment Agreement

12. As the Owner, I want the sign sheet to show the Investor's Nominees in force, and let me change them for this signing, so that the Agreement names the people the Investor wants today.
13. As the Owner, I want to be reminded, not stopped, when an Investor has no Nominee, so that nobody's capital is refused over a nominee.
14. As the Owner, I want the printed Agreement to show the Nominee table under the Investor, the Nominees-know line, and a line for each minor's Receiver to sign, so that the paper matches the prototype the Owner chose.
15. As the Owner, I want signing the Agreement to record its Nominees as that Investor's Nomination, so that a new Investor signs nothing extra. It also becomes the list in force.
16. As the Owner, I want the Agreement to keep which Nominees it named, even after a later Nomination replaces them, so that the farm can say what the stamped paper said.

### Where the list in force shows

17. As an Investor in the portal, I want my account page to show my Nominees, their shares, and each minor's Receiver, so that I can check them and ask the Owner in writing to change them.
18. As the Owner, I want the যোগদানপত্র, an Amendment to sign, and the Portal Consent sheet to print the list in force, because each describes the Investor as they are today.
19. As the Owner, I want the Data Copy to hold every Nomination and its Nominees, so that it answers a request for a copy in full.
20. As the Owner, I want the Investor's change log to show each Nomination recorded: who recorded it, on what day, and what it replaced.

### The wording

21. As the Owner, I want the standard Investment Agreement to carry the new heirs clause and its five rules in the Terms, and the new lines under the Investor, so that I can take them to the lawyer and publish them when approved.
22. As the Owner, I want a farm on an older Version to keep printing its own wording while the Nominee table prints anyway, because who the parties are is the farm's, not the wording's.

## Implementation Decisions

### The record

- **`nomination`**, one row per signed paper that names Nominees:
  - `id`, `farm_id`, `investor_id`
  - `signed_on` (the day, as the Agreement's `stamped_on` is kept)
  - `how`: one of `nomination` (a মনোনয়নপত্র), `agreement` (the Investment Agreement itself), `carried_over` (not yet signed for)
  - `agreement_id` (set when `how = agreement`)
  - `template_version_id` (the মনোনয়নপত্র's Version; null otherwise)
  - `recorded_by`, `recorded_at`
- **`nominee`**, one row per person on one Nomination:
  - `nomination_id`, `place` (1–3, the order printed)
  - `name`, `relation`, `phone` (nullable)
  - `born_on` (nullable only on `carried_over`)
  - `share_percent`
  - `receiver_name`, `receiver_relation`, `receiver_phone` (all null unless the Nominee is a minor on `signed_on`)
- **`nomination_paper`**, the photo, as `agreement_paper` is kept: one per `how = nomination` row. An `agreement` Nomination's proof is the Agreement's own photo.
- **The list in force** is the Investor's latest Nomination by `signed_on`, then `recorded_at`, then `id`. A timestamp alone ties inside a transaction. One `nominationInForce(tx, farmId, investorId)` in `packages/api` is the only way anything reads it.
- **Not yet signed for** is `how = carried_over`, and it is the only way a list is in force without a signature behind it.
- **A Nomination is never edited or deleted.** A mistake is put right by recording the next one, and the old one stays in the list.
- **The investor's `nominee_name`, `nominee_phone` and `nominee_relation` columns are dropped** in the same migration that moves them. `investors.record` and `investors.update` lose the `nominee` input. `readInvestor` and the Investor trail no longer carry a nominee.

### The rules, in the domain package

- **`nomineesProblem(nominees, onDay)`** in `@OpenFarm/domain` returns the first thing wrong, or null. The router refuses with it, and the web form shows it while typing. It checks:
  - `too_many` (more than 3)
  - `shares_not_whole`, `shares_not_hundred`
  - `born_missing`, `born_in_future`
  - `receiver_missing` (a minor with none)
  - `receiver_not_needed` (an adult with one)
  - `name_missing`
- **`isMinorOn(bornOn, day)`** is true until the eighteenth birthday. Everything that decides minority uses it: the check, the «নাবালক» mark, and which Receiver lines print.
- **None is allowed**, as an empty list with no problem.

### Recording a Nomination

- **`investors.nominationToSign({ id, nominees })`** is Owner-only and needs a personal session. It lays out the মনোনয়নপত্র from the farm's `nomination` Template for the list given, refusing with `nomineesProblem`. Nothing is written but the trail's line. It is an Export, like the other papers.
- **`investors.recordNomination({ id, nominees, signedOn, photo })`** is Owner-only and needs a personal session.
  - It writes the `nomination`, its `nominee` rows and the photo in one transaction, pinned to the Version in force.
  - It writes an Audit Event on the Investor naming the Nomination it replaces.
  - It refuses a retired Investor, as signing does.
  - `signedOn` may not be in the future, and may not be before the Nomination in force.
- **`investors.nominations({ id })`**, Owner-only, returns every Nomination newest first with its Nominees, how it came, and whether it has a photo.
- **Template kind `nomination`** is added to `TEMPLATE_KINDS`, with `RULES`:
  - fields `WHO`
  - `required: ["parties", "clauses", "signatures"]`, `refused: ["stamp"]`
  - `aboutMoney: false`, `englishPrinted: true`, `dated: true`
  - signers: the Investor, then the Owner as «সামনে · Before»

  Its standard wording is the draft's: the first-person opening as the preamble, «আমি জানি ও মানি যে» and rules 1–5 as the clauses part, and the closing sentence. `giveStandardTemplates` gives it to every farm.

### The parties part

- **`PaperInvestor.nominee` becomes `nominees: PaperNominee[]`.** `paperInvestor(row)` becomes `paperInvestor(row, nominees)`. Every paper with a parties part passes the list it means: the Agreement to sign passes the list being signed, and everything else passes the list in force.
- **The table is the farm's facts, not the wording's.** `investorRows` gives way to a party's `rows` plus a `nominees` table on the printed party (`PaperSection` parties gains `nominees`). The Nominee columns are name, relation, date of birth with «নাবালক» for a minor, phone and share. Each Receiver sits on the row beneath its Nominee. With no Nominee, the Version's `noNomineeLine` prints in place of the table, or the draft's sentence on a Version worded before there was one.
- **The wording's lines** extend the Template's parties section:
  - `nomineeLines` stays as the lines printed under every Investor with any Nominee (the Nominees-know line).
  - `receiverLine?: Said` is printed once per minor Nominee and only for them. It is filled with `{nomineeName}`, `{receiverName}` and `{receiverRelation}`, which are fields of that line alone, and ends in a signature blank.
  - `noNomineeLine?: Said` is printed in place of the table when there are none.

  A Version with neither prints as it did.

- `<PaperDocument>` in `apps/web/src/components/ventures/paper-document.tsx` draws the table and the lines. It lays the parties out one above the other when any party has Nominees: the half-width box is too narrow for five columns, as the prototype showed.

### The Investment Agreement

- **`investorStatements.agreementToSign`** takes an optional `nominees`, defaulting to the list in force, and refuses with `nomineesProblem`.
- **`ventures.sign`** takes the same `nominees`, and in its transaction records a `nomination` with `how = agreement`, `agreement_id` set and `signed_on` = the Agreement's `stamped_on`.
  - When the list signed equals the list in force and that list is already signed for, it still records one. The Agreement is a Nomination for what it named, and the Investor's history should show every paper.
  - The sign sheet sends exactly the list it printed.
- **Signing with no Nominee** records a `nomination` with no `nominee` rows. The sheet shows a reminder above the button ("কোনো নমিনি নেই" / "No Nominee") and never disables it.
- **`sign-agreement-sheet.tsx`** gains a Nominees block, filled from the list in force. The Owner can change it there, and the Investor's page links to it. The same block, as one component, is the Nomination sheet's.

### The next standard Version

- **The standard `investment_agreement`** gains a new Version holding:
  - the heirs clause and rules 1–5 in the Terms, replacing «…তাঁর নমিনির মাধ্যমে…»;
  - `nomineeLines` = the plural Nominees-know line;
  - `receiverLine` and `noNomineeLine` from the draft.

  `FIRST_PRINTED_AGREEMENT` and the current standard stay as they are. As with the data clause, **an existing farm moves only when the Owner publishes it**. The seed farm is moved and the user's `OpenFarm` database is not.

- **The data clause** («তথ্য / Data», clause 1) and **the Portal Consent sheet** say «নমিনি ও গ্রহণকারীর তথ্য» (the Nominees' and Receivers' details) in place of «নমিনির তথ্য», in the same new Versions. The privacy notice's list says the same.
- **Nothing is approved.** The lawyer sees it all at the pending meeting (pages 7–8 of the lawyer's pack).

### Where the list in force shows

- **Portal account page:** `portal-reads.ts` `record.nominees` shows every Nominee's name, relation, share and date of birth, and a minor's Receiver. The Portal Preview shows the same, through the source.
- **যোগদানপত্র** (`papers.ts` `joiningLetter`): the list in force, one line per Nominee with share, and a Receiver in brackets.
- **Amendment to sign** and **Portal Consent sheet:** the list in force, through `paperInvestor`.
- **Data Copy** (`data-copy.ts`): every Nomination newest first, with how it came, its day and its Nominees. The change log adds the Nomination trail.
- **Investors table:** the nominee column shows the first Nominee's name, followed by "+N" when there are more, or "not yet signed for".
- **Audit words** (`audit-words.ts`): a `nomination` entity with the words for recorded, and for signed with an Agreement.

### Moving what exists

- **No real Investor has signed yet** (the Owner, 2026-09-26), so the move is simple:
  - The migration turns each `investor.nominee_*` into a `carried_over` Nomination with one Nominee at 100% and no date of birth, dated at the migration.
  - Agreements get no backfilled Nomination.
  - The columns are then dropped.
- **The seed** makes every seeded Investor's Nominees by signing their Agreements. One seeded Investor has three Nominees, one of them a minor with a Receiver, and one has a later মনোনয়নপত্র with a photo. One Investor with no Agreement keeps a `carried_over` list, so the "not yet signed for" mark can be seen.
- On merge, migrate both dev databases and move `LATEST_MIGRATION`, then open the page.

## Testing Decisions

- **The seam is the oRPC router**, as for every Venture ticket. `nomineesProblem` and `isMinorOn` get unit tests in the domain package.
- **Rules:**
  - Each refusal code is tested at the router: through `recordNomination`, `nominationToSign`, `agreementToSign` and `sign`.
  - **Prove each guard by switching it off** and seeing the test go red.
  - An edge day: a Nominee turning eighteen on `signed_on` is not a minor.
- **List in force:**
  - The latest wins, including two Nominations recorded in one transaction on the same day. That tests the tie-break; a test that passes only by luck of order is a bug.
  - A `carried_over` list reads as not yet signed for, until either kind of paper is recorded.
- **An Agreement is a Nomination:**
  - Signing records one, with the list printed.
  - Signing with a changed list makes that list the one in force.
  - A later Nomination leaves the Agreement's own Nomination unchanged, which is what "the Agreement keeps which Nominees it named" means. Assert on its rows, not only that a row exists.
- **Owner-only:**
  - A Manager gets FORBIDDEN on each new procedure.
  - An Investor reads their Nominees only through the portal, and cannot record one.
- **Printed papers:**
  - Assert the Agreement to sign carries three Nominees with their shares, and one Receiver line only for the minor.
  - With none, assert the no-Nominee line and no table.
  - On an older Version, assert the table still prints and the wording is the old one.
- **Migration:** the moved seed data has one `carried_over` Nomination per Investor that had a nominee, and none for those that had none.
- **Twins:** the web form's check and the router's refusal are the same function. A test asserts the form imports `nomineesProblem` and does not rewrite it.
- **Every ticket ends with somebody opening the page:**
  - the Investor page, the sign sheet and the Nomination sheet, in both languages;
  - the portal account page at phone width;
  - both papers, by print preview cloned into an overlay.

  Web component tests are not collected.

## Out of Scope

- **What happens when an Investor dies:** recording the death, holding their share, and a Settlement paying the Nominees or the heirs. Ruled out when the map was charted.
- **Reprinting a signed Agreement.** OpenFarm has never printed one: the photo of the stamped paper is the record. The Agreement's own Nomination lets a reprint be built later with the Nominees it was signed with. If it is built, the screen, not the paper, says when a later Nomination has replaced them (ticket 04).
- **The Investor's other details as signed.** Name, phone, address and NID are still read from the record today. This is on the map's Out of scope.
- **Changing Nominees through the portal.** The portal stays read-only (ADR 0007). An Investor asks the Owner in writing.
- **Anything the lawyer's written opinion changes.** It comes in as a published Version and, if needed, a new map. For example, if an unstamped Nomination cannot replace a stamped Agreement's Nominees, or if a succession-certificate threshold is wanted.
- **The Master Agreement and Venture Schedule** carrying the table. They get it when they are built, because they use the same parties part.

## Further Notes

- **Correction to ticket 04:** the map said "a reprinted Agreement shows today's nominee". No reprint of a signed Agreement exists. The papers that print the nominee after signing are the যোগদানপত্র, an Amendment to sign and the consent sheet, and ticket 04 already has them describe today. Recording the Agreement's own Nomination is still needed, because the Agreement _is_ one.
- **The Investor form loses its nominee fields.** The `RELATIONS` list in `investor-sheet.tsx` moves to the shared Nominees block, where it serves both the Nominee's relation and the Receiver's.
- **Write copy both ways at once:** `bn` and `en` go in together. Shares and dates in Bangla sentences are worded where the string is built, pinned to `bn`.
- **Old cached answers:** the web app draws a persisted cache first. `nominee` on a cached Investor answer is replaced by `nominees`, so default it to `[]` when reading.
- **Grep CONTEXT.md** before naming anything new. **Nomination**, **Nominee** and **Receiver** are already there. "Carried over" and "list in force" are words in this spec, not glossary terms.
