# 02 — A late cost rides on the next month's Reimbursement

**What to build:** A month's Reimbursement is its own figure plus a line for each earlier month already reimbursed
whose figure has moved since — up or down — so whatever lands late reaches the Farm with the next transfer. The
Settlement counts what is still to be carried as owed. One transfer a month, as now.

**Blocked by:** 01

**Status:** open.

- [ ] **Glossary:** **Reimbursement** widened — "taken once per Venture per month once that month is over" gains
      "carrying, as its own lines, what any month already reimbursed has come to since, more or less; the last one
      before the Settlement catches whatever is left". No new word.
- [ ] **Schema:** `venture_movement.carried` — jsonb, a Reimbursement's only: each earlier month it carried and by how
      much, so a month's own figure is its amount less its lines, and what has been paid for a month is its own figure
      and every line carried for it since. Migration `…_reimbursement_carries`, both dev databases; existing rows read
      as carrying nothing.
- [ ] **Rule:** one function beside `consumedBy` — what a Venture owes the Farm month by month: for each month, what it
      comes to now, what has been paid for it, and the difference. A Reimbursement for month M takes M's own figure
      plus a line for every earlier month already paid for whose difference is not nothing. `reimburse`
      (`routers/ventures.ts:3341`) checks the typed amount against the total, writes the lines on the movement and in
      the trail's `madeOf`, and refuses `nothing_to_reimburse` where the total is nothing or less (the lines ride on).
      `month_already_reimbursed` stays. `monthsOwed` (`settlement-store.ts:141`) is replaced by the same function: the
      `a_reimbursement_is_owed` block carries the months never paid and the taka still to be carried.
- [ ] **Refusal words:** none new — `nothing_to_reimburse`, `amount_changed` and `a_reimbursement_is_owed` exist; the
      last's words on the Settlement sheet gain the taka still to carry.
- [ ] **Screen:** the Reimburse sheet (`components/ventures/reimburse-sheet.tsx`) shows, under the month's own parts,
      "আগের মাস থেকে" with each carried month and its taka (minus where it is less), and the total beneath; the
      defaults of a month nobody asked about yet (line 61) gain an empty list, for the cached answer.
- [ ] **Tests** (`routers/reimbursement.test.ts`):
  - **First, red before the fix:** March reimbursed, then a Feeding back-dated into March, then April reimbursed —
    today April is April's own and the Settlement owes nothing; now April carries a March line of the feeding's taka.
  - Less: a Correction lowering March's feeding carries a line below nothing.
  - A month with nothing of its own and a carried line is reimbursed; a total of nothing or less is refused and rides
    on to the month after.
  - Out of order: March reimbursed before February carries no February line, and February, taken later, is its own figure once — no month paid for twice.
  - The Settlement blocks `a_reimbursement_is_owed` with the taka not yet carried; once carried, 01's account adds up.
  - "does not take the same month twice" still green.
  - **Proved by switching off** the carried lines in the Settlement's owed check: the block test goes red.
- [ ] **Somebody opens it** (seed): a Feeding back-dated into a month the seed reimbursed; the next month's Reimburse
      sheet shows "আগের মাস থেকে" with that month and the feeding's taka, and after it is taken the Settlement sheet's
      account adds up.
