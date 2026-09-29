# 05 — Milk not accounted for

**What to build:** On the Milk page's Handed-over tab, each day's milk to Bulk against milk Dispatched, with a running
balance over the last 7 days. Milk from Sessions since the last Dispatch is "still in the tank"; anything above that is
"not accounted for". Beside it, litres to Calves per unweaned calf per day (decision 6). Past the line, a Digest notice
`milk_unaccounted` to Owner and Manager, told once per farm day it first crosses, as `baki_overdue` is.

**Blocked by:** —

- [ ] **Glossary:** widen **Reconciliation** (CONTEXT.md:145) with "across days, Bulk against Dispatches".
- [ ] **Domain `milkNotAccounted`** (pure). **Tests:** evening milk collected next morning nets to zero; a day with no
      Dispatch carries forward; more Dispatched than recorded shown, not flagged.
- [ ] **Notice:** the `baki_overdue` path (`alerts.ts`, `alert-kinds.ts`, `notice.ts:128`, `notify.ts:88,202`,
      `notice-facts.ts`, `notice-words.ts`, `the-day-turns.ts:327-343`, `alert-list.tsx`).
- [ ] **Schema:** Owner-only Farm Parameter `milkUnaccountedPercent`, listed like `HOW_LONG_BAKI_MAY_RUN`
      (`routers/farm.ts:207`).
- [ ] **Somebody opens it:** the tab, the notice, the digest line. Both languages.
