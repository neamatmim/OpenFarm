# 12 — A settled account keeps a paisa

**What is wrong:** A settled Venture's account does not close at nothing. It holds a paisa or two —
৳০.০১ on the demo farm — because the Settlement and the monthly Reimbursements work out the same
figure by rounding in a different order, and disagree by fractions.

`CONTEXT.md` says of a **Settlement**: "the last of the money going out is what makes the Venture
Settled … so a settled account reads nothing."

**Status:** done — the Owner chose the first of the three ways out (2026-09-20).

**Spec:** `CONTEXT.md` — **Settlement**, **Reimbursement**.

## The arithmetic, from the demo farm

কোরবানি ২০২৬, settled 2026-09-05. What the Settlement charged under the heads a Reimbursement covers:

| head             | taka            |
| ---------------- | --------------- |
| feed             | ১,৫২,০৫৯.৫৬     |
| medicine         | ১,০৮৬.৬৭        |
| vet              | ০               |
| herd costs       | ১,১১৭.৭৭        |
| the Selling Trip | ৯,৮২৬           |
| **charged**      | **১,৬৪,০৯০.০০** |

What actually went back to the Farm, month by month: ২২,৪৭২.১৮ + ৭২,০৭৭.৯৯ + ৬৯,৫৩৯.৮২ =
**১,৬৪,০৮৯.৯৯**.

**One paisa apart** — and one paisa is exactly what the account is left holding.

## Why

`roundTaka` rounds to the paisa, not to the taka — an earlier guess that it rounded to whole taka was
wrong. The difference is in the **order** of the rounding, and it is deliberate on one side:

- A month's Reimbursement is `roundTaka(feed + medicine + vet + herd + trips)` where **each part is
  already rounded** (`cost-store.ts`, `consumedBy`). The comment there says why: "The sum of the parts
  as they are shown, not of the parts before they were rounded: five lines that do not add up to the
  figure beneath them is the farm arguing with itself in front of an Investor." That is a good reason.
- The Settlement adds the raw shares over the whole run and rounds once (`chargedTo`).

Round-then-sum and sum-then-round are not the same. Over three months here the gap is ০.০১; it could as
easily be the other sign, and a longer run has more months to differ in. Nobody is systematically
favoured — but a settled account never lands on nothing except by luck.

## What has to be decided (the Owner's)

1. **The Settlement sweeps it.** It already does exactly this for the per-Unit floor —
   `roundingBdt`, the remainder the Investors round down past, goes to the Farm. The leftover paisa
   could join it. Smallest change, one existing idea doing one more job, and the Farm keeps a paisa it
   did not earn — which is what it already does with the other remainder.
2. **The Settlement charges what was actually reimbursed.** For those heads, read the Reimbursement
   movements instead of recomputing from the shares. They agree by construction and there is nothing
   left over. But the Settlement stops being one arithmetic over the whole run, and a month never
   reimbursed — a Venture settled in the month its animals last ate — would fall through.
3. **Leave it.** A paisa is a paisa. Then `CONTEXT.md` should stop saying a settled account reads
   nothing, because it does not, and the Venture card should round the figure it shows so the Owner is
   not shown ৳০.০১ and left wondering.

## Checked before writing

- The figure is real, not float drift: read at exact numeric precision the balance is `0.01`.
- Not caused by the Selling Trip work of 2026-09-19 — that removed ৳৯,০০১ of genuinely unpaid lorry
  from the same account and left this behind. The paisa was inside that number all along.
- No test asserts a settled balance of exactly zero except `settlement.test.ts`, whose figures are
  round by construction and so never meet this.

## What was decided, and what was built

**The Owner chose the Settlement sweeping it** (2026-09-20). The paisa joins `roundingBdt`, the
remainder the per-Unit flooring already leaves to the Farm, and leaves on the same line of the same
statement. One existing idea doing one more job.

**A taka is not swept.** The sweep is the account's own remainder — what it would still hold once the
Owner's Advance and every payout had left — and it is folded in only while it is under a taka. Anything
larger is not paisa drift: it is the run's charges genuinely disagreeing with the money that moved, and a
Settlement that quietly moved it would be hiding the thing the Owner has to go and find. `sweptUp` is the
whole of that judgement and `settlement-rounding.test.ts` pins it, proved by forcing the guard open and
watching the taka case go red.

**The bound is what stops it ballooning.** Before a run is over the account still holds what the animals
are eating through, so "what is left" is not a remainder at all — an unbounded sweep would have handed
the Farm most of a running Venture's capital as its share. That is the trap in this ticket and the reason
for the threshold, rather than tidiness.

**কোরবানি ২০২৬ keeps its paisa, and should.** Its Settlement was approved on 2026-09-05 and approval
freezes every figure — that is the whole point of approving, and a Correction landing afterwards is
refused in favour of a Settlement Adjustment. So the demo farm still reads ৳০.০১ and will for ever. Runs
settled from now on land on nothing.

**`CONTEXT.md` now says what it does rather than what it wished.** The **Settlement** entry said "a
settled account reads nothing", which was not true; it says so exactly now, names the paisa and says
where it goes.
