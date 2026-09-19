# 13 — An Agreement may be amended

**What to build:** Stories 7 and 8, the last unbuilt feature in the spec. An Investment Agreement's
terms are frozen at signing and there is no way to change them — which is half right. The spec says
they may change **by a dated amendment signed by every Investor in that Venture**, stored as its own
photo beside the original, with the system able to say which terms were in force when.

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) stories 7 and 8, and its
implementation note at line 168: "**Amendments** are rows against an Investment Agreement carrying the
changed terms, the date, and the photo; the agreement in force at a time is the latest amendment on or
before it. The original is never edited." Sequencing put it in increment 2. `CONTEXT.md` — **Investment
Agreement**.

- [x] An Agreement's terms may be amended, with the day it was signed and a photo of the amendment
- [x] The original row is never edited, and the trail shows what changed
- [x] The terms in force on a given day are readable — the latest amendment on or before it
- [x] The **যোগদানপত্র** prints the terms in force rather than the terms at signing
- [x] An amendment is the Owner's alone, and refused once the Venture's Settlement is approved
- [x] Somebody amends one on a screen and reads the letter afterwards

## Checked before starting

**It was specified, scheduled, and dropped.** The spec put amendments in increment 2 — "the tables, the
states, agreements and amendments" — and increment 2's four tickets never mention them. Nothing in
`packages/`, `apps/` or the schema contains the word. Increment 6's ticket 02 found the same hole from
the other side and marked its own criterion partial rather than quietly passing: "story 8's dated
amendment … is not in the schema: there is no amendment table and no 'terms in force on a date'.
Whoever builds amendments should know this paper is waiting for them."

**The freeze half already works, by omission.** `investment_agreement`
(`packages/db/src/schema/venture.ts:124`) holds `units`, `investorsPercent`, `targetWindowStart/End`,
`arbitrator` and the stamp's value, date and serial — and no procedure anywhere updates that row. So
nothing can move a term today, which is why only the escape hatch is missing.

**There is a shape to copy for the photo.** `agreement_paper` (`:166`) is its own table keyed by
`agreementId`, holding `contentType` and base64 `data`. An amendment's photo wants the same treatment,
but keyed by the amendment rather than the Agreement, since there may be several.

**One design question, settled here.** Story 7 says an amendment is "signed by every Investor in that
Venture"; the implementation note says amendments are "rows against an Investment Agreement". They fit
together one way: **one paper, signed by everybody, recorded as one row per Agreement, in one
transaction** — which is what the farm actually does, and it means a Venture can never end up half
amended. So the act is on the Venture and the rows are on the Agreements. One photo, kept once and
pointed at by each row, because it is one photograph of one piece of paper.

**What may be amended is not everything on the paper.** Story 7 names "percentages and window". Units
are a different matter — `CONTEXT.md` says they are "Fixed once the Venture starts Buying", and the cap,
the capital already taken and every share worked out since all rest on them. Amending Units is not in
the stories; do not add it because the column is there.

**The joining letter reads the Agreement directly.** `joiningTerms`
(`packages/api/src/investor-statement-words.ts:33`) prints `standing.agreement.investorsPercent` and the
window off the Agreement row. Once amendments exist it must print what was in force — that is criterion
4, and it is the thing increment 6 was waiting for.

**Migrations are generated, not hand-written.** `packages/db` runs `drizzle-kit generate` into
`src/migrations/`, one timestamped directory per change. Add the table to the schema and generate; do
not write SQL by hand.

**A settled Venture's books are shut.** `assertNotSettledUp` guards the money acts. An amendment after a
Settlement was approved would move figures everybody was already paid on, so it belongs behind the same
guard — and that is worth a test, because the refusal is the point.

## What was decided while building

**The act is on the Venture; the rows are on the Agreements.** `ventures.amend` takes a Venture and
writes one `agreement_amendment` row per Agreement inside one transaction, all sharing one `amendedId`,
and one `amendment_paper` row under that id. One photograph of one piece of paper, kept once. A Venture
can never end up half amended.

**Only the split and the window move.** Units, the arbitrator and the stamp stay where they were signed.
Story 7 names percentages and window; everything worked out since rests on the Units.

**`signedOn` decides what was in force, not `createdAt`.** `termsInForceOn(tx, agreementId, on)` takes
the latest row with `signedOn <= on`, ordered `{ signedOn: "desc", id: "desc" }` — the id is the
tie-break, because two amendments signed the same day sort arbitrarily otherwise. Typing an amendment in
late does not change which terms governed a day that has already passed.

**The joining letter says it was amended.** Criterion 4 asked only that the letter print the terms in
force, and at first it did exactly that — silently. Two letters printed a month apart would then
disagree with each other in a man's hands with nothing to explain it. `JoiningLetter` gained
`amendedOn`, and the letter now closes the terms with `(… তারিখের সংশোধনী অনুযায়ী / as amended on …)`.
The doc comment that said "a man who signed before an amendment agreed to what his paper says" was left
over from the freeze-only world and was corrected: an amendment is signed by everybody, so the terms
move for everybody.

**A settled Venture does not offer the button.** The server refuses it, and `settlement.test.ts` now
proves it — removing `assertNotSettledUp` turns that test red. A button that can only ever be refused is
worse than none, because somebody fills the whole form, photographs the paper and then hears no, so
`termsCanStillMove` hides it too.

**The Venture's own Target Window is not moved.** The card still shows the dates the Venture was opened
with. The terms an Investor is owed are on his Agreement and that is what the papers read; the Venture's
own window is the plan the Owner set. Worth revisiting if the two drifting apart ever confuses her.

## Found by opening the screen

Three, none of which the 1164-test suite could see:

1. **The share label printed a literal `{percent}`.** I reused `ventures.investorsShare`, which takes a
   parameter and reads "The Investors' {percent}%" — right for a card line, wrong for a form label. It
   has its own `ventures.amendShare` now.
2. **The two new refusals had no Bangla.** `unworded-refusals.test.ts` caught this, and the answer was to
   word them rather than list them: the Owner meets both on this sheet.
3. **The seeded database had never had the migration run.** Not a code defect — but it is what a first
   amendment on the demo farm actually hits, and `pnpm run db:migrate` against `openfarm_seed` is the
   answer.


## What the review changed

Two subagents read the diff against the standards and against the spec. Six findings were real, and two
of them mattered more than anything in the ticket.

**The Settlement divided on the terms that were signed, not the terms in force.** The worst possible
outcome for this feature: after a 60→55 amendment the যোগদানপত্র promised a man fifty-five while
`settlement-store.ts` split the profit sixty, reading `investorsPercent` straight off the Agreement row.
The paper and the money would have disagreed silently, which is worse than having no amendments at all.
A test in `settlement.test.ts` pinned it red first; the Settlement now overlays the terms in force on
the day it is worked out. Units, the Investor and the stamp still come off what he signed, and never
move.

**Criterion 5 had no test, whatever the ticket said.** I had written that the refusal "has a test". It
did not — nothing approved a Settlement and then tried to amend. Deleting the guard left the suite
green. It is tested now, and proved by deleting the guard and watching it go red.

**The audit trail showed nothing.** `before` and `after` both read the Venture row, which an amendment
never touches, so the trail recorded two identical snapshots. Both sides now read what every Agreement
said on the day they signed, so the event carries the terms as they stood and the terms they became.
Proved the same way.

**The formatter had reflowed four files to a foreign width.** Running `vp fmt` on the changed files
alone reflowed them to about a hundred columns, burying the feature under 500 lines of noise —
`ventures.ts` alone read as 645 changed lines and is 132. `pnpm dlx ultracite fix` is the repo's
formatter; the other one is not.

**Four doc comments had been orphaned by insertions**, the same way they have been in seven reviews
before this. Each was put back over the declaration it describes.

**`CONTEXT.md` still said an Agreement's terms are "never moved afterwards".** Now false. It has an
**Amendment** entry, the Investment Agreement entry points at it, and **Correction** no longer lists
"amendment" as a word to avoid — it is a real word for a different act, and the entry says which.

Also taken: `termsInForceOn` is farm-scoped like its neighbours; `termsOn` reports whether the signed
amendment is on file, the way `agreements` reports the stamped paper; the toast formats its count in the
reader's own numerals and no longer reads "1 agreements"; the migration is
`20260919182256_an_agreement_is_amended` rather than drizzle's `bright_magneto`; the tie-break on
`signedOn` has a test that goes red without it.

Left as they are: the amendment photograph is written and never served, exactly as the stamped
Agreement's photograph is — both are kept for a dispute and read off the database, and `termsOn` says
whether one is held. Terms in force are applied to all three papers rather than only the যোগদানপত্র,
because a progress sheet quoting a dead split would be the same defect one paper along. The `reason`
column is not in the spec's line 168, but the trail is worthless without it.
