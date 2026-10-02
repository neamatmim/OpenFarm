# 05 — The Running Budget warning counts what is owed

**What to build:** The warning that a Venture's Running Budget is low reads what is left after what its animals have
cost the Farm since the last Reimbursement — every month not yet reimbursed, this month so far, and lines not yet
carried — so it fires when the money runs short, not a month after.

**Blocked by:** 02

**Status:** open.

- [ ] **Glossary:** **Running Budget** — "said to be low when what is left, less what its animals have eaten of the
      Farm's since the last Reimbursement, falls below the Owner's line". The figure held, and what an Investor's
      অগ্রগতি shows, stay what the account holds.
- [ ] **Schema:** none.
- [ ] **Rule:** `ventureView` (`venture-store.ts:306`) gains `owedTheFarmBdt` in `alsoKnown` — asked for, not
      defaulted, like the others — from 02's function up to today; `runningBudgetLow` (355) compares
      `runningBudgetHeldBdt - owedTheFarmBdt` with the line. The Manager's `running` (`routers/ventures.ts:774`) reads
      the same function rather than repeating the sum. The farm's costing is read once per list, not once per Venture.
      `drawFloat`'s and the Internal Sale's `ventureView` calls (1836, 2160) pass it too.
- [ ] **Refusal words:** none.
- [ ] **Screen:** "খাওয়ানোর টাকা কমে আসছে — ৳{left} বাকি" (`ventureTrouble.runningBudgetLow`) says what is left after
      what is owed; the Venture card shows "খামারের পাওনা ৳…" under the Running Budget while anything is owed. The new
      field is defaulted for the cached answer.
- [ ] **Tests** (`routers/ventures.test.ts`, or beside the Advance's in `routers/advance.test.ts`):
  - **First, red before the fix:** a Venture holding a little above the warning line whose animals have eaten more
    than the margin this month — not low today; low now, in `ventures.list` and in the Manager's `running`.
  - The twins agree: one test reads both procedures for the same Venture and compares the flag and the figure.
  - Reimbursed, the warning reads the same as before the transfer, give or take paisa.
  - **Proved by switching off** the owed figure in each of the two procedures: each red.
- [ ] **Somebody opens it** (seed): with the warning line set in Farm Parameters just above a seed Venture's
      Running Budget, its card warns once the month's feeding is counted, and the home page's Venture trouble says the
      same taka.
