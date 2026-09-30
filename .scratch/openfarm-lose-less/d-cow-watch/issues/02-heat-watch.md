# 02 — Heat watch: after calving, and after a service

**What to build:** A list the Manager works from, of each open cow (`milking` or `dry`, no `expectedCalvingAt`) who is
(a) N days past her Calving with no Heat in the last cycle (decision 1), or (b) in the return-heat window of her latest
Attempt with no Heat since and no Pregnancy Check yet. Each row: tag, Pen, days since calving, last heat, reason. In the
Manager's home queue beside Repeat Breeders and a tab on the Vet page.

**Blocked by:** 01

**Status:** done, 2026-09-30.

- [x] **Glossary:** **Heat** widened with the heat watch (the phrase was already under Abortion); no new word.
- [x] **Domain `heatWatchOf`** (pure, `breeding.ts`, reusing `attemptsThatBegin`): an open cow with a calving day —
      `return_due` when her latest attempt since calving is 18–24 days old with no heat since and no check; otherwise
      `no_heat` from the farm's day after calving with no sign of heat in the last 24 days. A service counts as a sign
      (a bull serves cows nobody saw). Past the window with no check, she waits on her Pregnancy Check and is left off.
      `RETURN_HEAT_FROM_DAYS` 18 / `RETURN_HEAT_UNTIL_DAYS` 24 are constants (decision 2: a fact about cattle).
- [x] **Schema:** Farm Parameter `heat_watch_after_calving_days` (60, decision 1), the Manager's; group "Heat watch" with
      DLS's 50–60 days in its hint.
- [x] **API:** `heatWatchOn` (breeding store), `breeding.heatWatch` (Owner, Manager, Vet), `home.manager.queue.heatWatch`.
- [x] **Screens:** "Heat watch" / "গরমের দিকে নজর" in the Manager's queue after the ill-again group, and a tab on the
      Vet's page (in-house Vets). Each row: tag, days since calving, the last sign of heat or "no heat seen", or "due back
      in heat — served …", and the Pen; it opens her Breeding tab. It asks for eyes, never says barren.
- [x] **Tests:** `breeding.test.ts` (7) — named at day 60 not 59; off within a cycle of a heat and back after it; a
      service is a sign; due back 18–24 days and not outside; off once back in heat or checked, then watched as open;
      off when carrying, a heifer, or with no calving day; an aborted cow back on. `routers/heat-watch.test.ts` (3) —
      from the opening register's `calved_at`, on the Manager's home, off once a heat is reported; the Vet may read it,
      Barn Staff may not. **Proved by switching off** the "no heat lately" rule (3 red) and the return window (2 red).
- [x] **Somebody opens it** (seed, 2026-09-30): ten cows on it, all "no heat" — the Manager's queue "গরমের দিকে নজর ১০",
      "D-0007 — বিয়ানোর ২৮৮ দিন, ১৬ জুলাই, ২০২৬ থেকে গরম দেখা যায়নি · দোহন পেন ১"; the Vet's page, in English, "Heat watch
      10", "288 days since calving, no heat since 16 July 2026".

**Left for later:** decision 7 (Barn Staff see the tags of their own Pens) — the procedure refuses Staff today; showing
them the list is a change to their Today screen, its own small ticket.

**For the Owner:** a cow on the opening register is watched only when its `calved_at` column says when she last calved;
without it the farm has no day to count from and she is left off.
