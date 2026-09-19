# 16 — "Reimbursed" is not a figure of its own

**What is wrong:** Story 21 asks to see, per Venture, **capital in, spent, reimbursed, paid out** and the
balance the account should hold. Four of those five exist. A **Reimbursement** is added to `spentBdt`,
the same line as a Buying Float and an Internal Sale, so the Owner cannot tell what a Venture paid the
Farm back from what it spent at the haat.

That is the recurring outflow of a running Venture, and it is the figure an Investor asks about: the
Farm pays for the feed all month and takes it back once. Today the only way to read it is to open the
movements list and add the rows up.

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) story 21. `CONTEXT.md` —
**Reimbursement**, **Venture Account**.

- [x] A Venture reports what it has reimbursed as its own figure
- [x] The balance it should hold is unchanged — this splits a line, it does not move money
- [x] The Owner reads it on the Venture's card, beside what was spent
- [x] A Venture that has reimbursed nothing says nothing rather than a zero nobody asked about

## Checked before starting

**Where the lines are decided.** `WHAT_IT_DOES` (`packages/api/src/venture-store.ts:259`) maps each kind
of movement onto one of the `Held` lines. `reimbursement` points at `"spentBdt"` with `cattle: 0` — the
comment there is about which budget it comes out of, which is right, and says nothing about it sharing a
line with buying.

**What must not move.** `balanceOf` (`:81`) is capital in plus proceeds plus advances, less refunded,
spent and paid out. Splitting a line out of `spentBdt` means `balanceOf` has to subtract the new line
too, or every Venture's balance silently rises by everything it ever reimbursed. That is the whole risk
in this ticket, and it is worth a test that pins a balance across the change rather than only a test that
the new figure appears.

**What already reads these lines.** `budgetsOf`, `bankStandingOf` and the Settlement all read `Held`.
Anything summing `spentBdt` to mean "everything that left" needs the new line adding, and anything
reading it to mean "what buying cost" is now more accurate rather than less.

**The card has a place for it.** `ventures.tsx:302` prints spent and paid out on one line as
`{spent} · {paidOut}`. The Reimbursement belongs beside them, and `CONTEXT.md` calls it
"ভেঞ্চারের খরচ ফেরত" already, so there is no new word to invent.

**A Venture that never reimbursed.** Most of the demo farm's have; a cancelled one has not. Saying
"৳০ reimbursed" on a Venture that has never had a month is noise — the card should leave it out, as it
does with other figures that have not happened yet.

## What was decided while building

**`balanceOf` subtracts the new line.** That was the whole risk: splitting a line out of `spentBdt`
without it would have raised every Venture's balance by everything it had ever reimbursed. The existing
test that pins `balanceBdt: heldBefore - 2000` is what guards it, and it stayed green throughout.

**One zero value, not two.** `settlement-store.ts` kept its own copy of `NOTHING_HELD`, which is exactly
why it drifted the moment `Held` gained a field — TypeScript caught it, but the second copy would drift
again. `venture-store` exports the one now and the duplicate is gone.

**A Venture that never reimbursed says nothing.** The line is left off rather than shown as ৳০, the way
the open-Float figure already is.

## Read off the demo farm afterwards

The split adds back to what the card used to show, which is the strongest thing that could be checked —
these are the same two Ventures read earlier in the same session, before the change:

| Venture | as it read before | as it reads now | sum |
| --- | --- | --- | --- |
| ঈদ ২০২৭ | ৳৭,১৬,৬৮৪.২৭ out | ৳৫,৭৬,৮৫২ out · ৳১,৩৯,৮৩২.২৭ back to the Farm | ৳৭,১৬,৬৮৪.২৭ |
| কোরবানি ২০২৬ | ৳৮,৭১,৭২৯.৯৯ out | ৳৭,০৭,৬৪০ out · ৳১,৬৪,০৮৯.৯৯ back to the Farm | ৳৮,৭১,৭২৯.৯৯ |

And the balances did not move: কোরবানি still reads ৳০.০১ and ঈদ ২০২৭ still ৳৩,৪৩,৩১৫.৭৩, both
identical to before. The four Ventures that have never had a month show no line at all.
