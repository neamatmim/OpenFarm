# 03 — Monthly sums while it runs

**What to build:** A Venture paid by the month takes each Agreement's monthly sums by bank while it is buying or
fattening (and selling, if the Owner decides so), into its Running Budget, never more than the Agreement signed for.

**Blocked by:** 02

**Status:** not started

- [ ] **`takeCapital`** allows the running states for these Ventures only; refused over what is still owed, after the
      last month's sum is in, and for a Venture paid all before buying (as today).
- [ ] **Running Budget** grows by what arrives, so a month's Reimbursement can be paid from it; the Advance still
      covers a month nothing came in for.
- [ ] **Corrections** of a monthly sum, as of any capital movement (`corrections/venture-movement.ts`).
- [ ] **Portal "how to pay"** shows this month's sum, what is owed altogether and the due day, while anything is owed.
- [ ] **Tests:** a sum lands in the Running Budget not the Cattle Budget; the refusals; the Settlement after all months
      paid divides exactly as Units signed.
