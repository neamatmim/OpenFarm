# 05 — The Running Budget warning counts what is owed

**What to build:** The warning that a Venture's Running Budget is low reads what is left after what its animals have
cost the Farm since the last Reimbursement — every month not yet reimbursed, this month so far, and lines not yet
carried — so it fires when the money runs short, not a month after.

**Blocked by:** 02

**Status:** done, 2026-10-02.

- [x] **Glossary:** **Running Budget** — "said to be low when what is left, less what its animals have eaten of the
      Farm's since the last Reimbursement, falls below the Owner's line". The figure held, and what an Investor's
      অগ্রগতি shows, stay what the account holds.
- [x] **Schema:** none.
- [x] **Rule:** `ventureView` (`venture-store.ts:306`) gains `owedTheFarmBdt` in `alsoKnown` — asked for, not
      defaulted, like the others — from 02's function up to today; `runningBudgetLow` (355) compares
      `runningBudgetHeldBdt - owedTheFarmBdt` with the line. The Manager's `running` (`routers/ventures.ts:774`) reads
      the same function rather than repeating the sum. The farm's costing is read once per list, not once per Venture.
      `drawFloat`'s and the Internal Sale's `ventureView` calls (1836, 2160) pass it too.
- [x] **Refusal words:** none.
- [x] **Screen:** "খাওয়ানোর টাকা কমে আসছে — ৳{left} বাকি" (`ventureTrouble.runningBudgetLow`) says what is left after
      what is owed; the Venture card shows "খামারের পাওনা ৳…" under the Running Budget while anything is owed. The new
      field is defaulted for the cached answer.
- [x] **Tests** (`routers/ventures.test.ts`, or beside the Advance's in `routers/advance.test.ts`):
  - **First, red before the fix:** a Venture holding a little above the warning line whose animals have eaten more
    than the margin this month — not low today; low now, in `ventures.list` and in the Manager's `running`.
  - The twins agree: one test reads both procedures for the same Venture and compares the flag and the figure.
  - Reimbursed, the warning reads the same as before the transfer, give or take paisa.
  - **Proved by switching off** the owed figure in each of the two procedures: each red.
- [x] **Somebody opens it** (seed): with the warning line set in Farm Parameters just above a seed Venture's
      Running Budget, its card warns once the month's feeding is counted, and the home page's Venture trouble says the
      same taka.
- Done: `routers/running-budget-owed.test.ts` (2) — red before (no owed figure; the warning silent with ৳3,000 eaten
  over a line ৳1,000 under the account); the Owner's list and the Manager's `running` read the same flag and figure;
  repaid, the warning reads the same. Switched off in each procedure: red. `owedTheFarmByEach` in
  `reimbursement-store.ts` — months never repaid, this month so far, lines still to carry — the farm's costing once per
  list and not at all when nothing runs. **Changed from drafting:** `drawFloat`'s and the Internal Sale's views pass
  ৳0 (they read only the Cattle Budget, and working the whole costing out inside their locked write buys nothing), and
  so does `readVenture` (the trail keeps what the account holds; `reimbursement-store` imports `venture-store`, so the
  reverse would be an import cycle, which lint refuses). `advance.test.ts`'s animals now eat inside the test that
  watches the money run short, since the warning rightly reads them as owed from the day they eat.
  Seed: the line moved to ৳3,70,000 for a moment, between "ঈদ ২০২৭ ভেঞ্চার"'s ৳3,92,416 held and ৳3,55,526 left after
  ৳36,890 owed — the page showed "চলতি বাজেট কমে এসেছে" and "খামারের পাওনা ৳৩৬,৮৯০", and the Owner's queue on /farm "খাওয়ানোর টাকা
  কমে আসছে — ৳৩,৫৫,৫২৫.৬৩ বাকি"; the line set back to ৳50,000 (read from the database). The queue's taka shows
  paisa where the card rounds — as it did before this ticket.
