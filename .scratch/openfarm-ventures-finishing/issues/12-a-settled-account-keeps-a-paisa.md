# 12 — A settled account keeps a paisa

**What is wrong:** A settled Venture's account does not close at nothing. It holds a paisa or two —
৳০.০১ on the demo farm — because the Settlement and the monthly Reimbursements work out the same
figure by rounding in a different order, and disagree by fractions.

`CONTEXT.md` says of a **Settlement**: "the last of the money going out is what makes the Venture
Settled … so a settled account reads nothing."

**Status:** ready-for-owner — every way out moves somebody's money, even if only by a paisa.

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
