# 18 — Nothing says a Venture's records are kept

**What is wrong:** Stories 73 and 99 want a Venture's whole settlement record, its payments and its
statements kept for at least twelve years and **never deleted**. They are — by accident. Nothing purges
anything, so everything survives; but nothing decided that, nothing says it, and nothing would notice a
purge being added next year.

One thing is genuinely deleted today: a Venture's **payment** for an Animal, when a Correction says she
was never that Venture's. That is the one case worth arguing about, and it is currently unargued.

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) stories 73 and 99.
`docs/research/bangladesh-pooled-investment.md` §6 — twelve years is the longest applicable period
(Companies Act 1994 s.181(5)), and it covers VAT's five and income tax's six-assessment-year reach.

- [x] A guard names every Venture record the farm may delete, so a new one cannot be added quietly
- [x] The one deletion that exists is either justified in writing or stopped
- [x] Twelve years is written down where somebody would look for it, not only in a research note

## Checked before starting

**Eleven tables hold a Venture's story.** `packages/db/src/schema/venture.ts`: `venture`, `investor`,
`investmentAgreement`, `agreementAmendment`, `amendmentPaper`, `agreementPaper`, `ventureMovement`,
`ventureBankCheck`, `ventureSettlement`, `ventureSettlementShare`, `settlementAdjustment`.

**Exactly one of them is ever deleted from.** A sweep of `.delete(` across `packages/api/src` finds five
sites, and only `venture-store.ts:789` touches a Venture table — `ventureMovement`. The others are
`animalMove`, `milkRecord`, `stockCount`, `weighIn` and `service`, none of which is a Venture record.

**What that one does.** A Sale writes a movement into the Venture's account. If a Correction later says
the Animal was the Farm's, or that she was given away for nothing, the movement is removed rather than
reversed — the comment there reads "it is the farm no longer claiming a payment it does not hold". The
Audit Event for the Correction keeps who, when, why and the values either side.

**This is the question already in front of the lawyer.** The [lawyer's
brief](https://claude.ai/code/artifact/9f1635ee-93b0-4de4-8cac-2cb2a557fac3) lists it as divergence 4 and
asks whether the audit record alone satisfies the twelve years, or whether the entry must be reversed and
left in place. So this ticket does **not** change the behaviour — it pins it, so that the answer can be
applied to one known place rather than looked for again.

**Guard tests are how this repo pins a list.** `apps/web/src/i18n/unworded-refusals.test.ts` names the
refusals nobody has worded and fails when the list changes, "named, not counted: a number going up tells
nobody which one arrived". The same shape fits here.

## What was decided while building

**Pinned, not changed.** The one deletion stays exactly as it was. It is already in front of the lawyer
as divergence 4, and guessing his answer would be worse than waiting for it — the point of this ticket is
that when he answers there is one named place to apply it to, rather than a sweep to run again.

**Named, not counted.** The guard lists `ventureMovement` and fails with the name of anything new. Proved
by adding a deletion of `ventureSettlement` to `venture-store.ts` and watching it go red naming it.

**The guard checks it can still see.** A second test asserts the pattern still matches deletions that are
really there, so a rename or a moved folder cannot leave the first one passing by knowing nothing — the
same trap `unworded-refusals.test.ts` guards against.

**Twelve years is in `CONTEXT.md` now**, as its own **Retention** entry, with why twelve and what it
covers. It was only in a research note, which is not where anybody would look for it.

## Story 46 checked at the same time, and needs nothing

"Equipment bought because a Venture needed it stays the Farm's." A Venture's money can only move in the
twelve ways `VENTURE_MOVEMENT_KINDS` allows (`packages/db/src/schema/venture.ts:245`) — capital, refund,
float out and back, either side of an Internal Sale, a Sale's proceeds, payouts, the Advance and its
repayment, the Farm's share, and a Reimbursement. None of them buys equipment, so a Venture cannot. And
since ticket 14, equipment is a standard Category that may never be marked as charged to the animals, so
it cannot reach them the long way round either. Satisfied by construction; nothing built.
