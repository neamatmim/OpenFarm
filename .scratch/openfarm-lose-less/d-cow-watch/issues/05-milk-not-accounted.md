# 05 — Milk not accounted for

**What to build:** On the Milk page's Handed-over tab, each day's milk to Bulk against milk Dispatched, with a running
balance over the last 7 days. Milk from Sessions since the last Dispatch is "still in the tank"; anything above that is
"not accounted for". Beside it, litres to Calves per unweaned calf per day (decision 6). Past the line, a Digest notice
`milk_unaccounted` to Owner and Manager, told once per farm day it first crosses, as `baki_overdue` is.

**Blocked by:** —

**Status:** done, 2026-09-30.

- [x] **Glossary:** **Reconciliation** widened with the week's milk.
- [x] **Domain `milkAccountOf`** (pure, `domain/milk.ts`): over the last `MILK_ACCOUNT_DAYS` (7) farm days — what was in
      the tank when the week began (milked since the last Dispatch before it), into the tank, out of the gate, still in
      the tank now (milked since the last Dispatch), and what is left: `notAccounted` and its percent of what went in.
      Below nothing when more left than the records put in, shown and never flagged.
- [x] **API:** `milkAccountOn` (dispatch store, by the same to-Bulk figure as the day view, reading three days before the
      week for the tank at its start) with the calves' litres a day and a calf; `milk.account` (Owner, Manager) with the
      Owner's line.
- [x] **Notice** `milk_unaccounted`: digest, Owner + Manager, about the farm day — told once an evening while the week is
      past the line (not only on the day it first crosses: it goes on being true). Raised by the sweep
      (`tellAboutUnaccountedMilk`), which writes nothing on a day already told or a week that balances.
- [x] **Schema:** `milk_unaccounted_percent` (3), **the Owner's alone** (decision 5), refused to the Manager with the
      store's line.
- [x] **Screen:** "The week's milk" card above the day's Dispatches on the Handed-over tab — each figure in litres, not
      accounted for in red past the line; the calves' line only when calves drank from the pail that week (decision 6:
      shown, never flagged).
- [x] **Tests:** `milk.test.ts` (4) — an evening's milk collected next morning nets to nothing; a litre short a day
      named; a day nobody collected is still in the tank; more out than in is below nothing.
      `routers/milk-account.test.ts` (3) — six mornings of ten litres against six Dispatches of nine is 6 L, 10%; the
      Owner and the Manager told once however often swept; the line is the Owner's. **Proved by switching off** the
      tank at the week's start (3 red) and now (4 red).
- [x] **Somebody opens it** (seed, 2026-09-30): the card read 110 L in the tank at the week's start, 1,579.6 into it,
      1,703 out of the gate, 0 still in it, −13.4 not accounted for (−1%) — the −13.4 being D-0003's milk halved in the
      seed's database for 04, so more left than the records now say went in. The calves' line hid: the seed records no
      milk to calves.

**Left alone:** the per-Session tank-against-cows mismatch (decision 8) stays a list with its count, as it is.
