# 02 — Weighed short, by seller

**What to build:** The Owner's Early losses card counts, beside each seller and each haat, the bulls of the last year
whose first Weigh-in came in under their arrival weight by more than the Owner's line.

**Blocked by:** 01

**Status:** open.

- [ ] **Glossary:** **Intake** widened (the yearly count by seller and haat includes those weighed short).
- [ ] **Schema:** none — read from the Intakes and their first Weigh-ins, as the losses are.
- [ ] **Rule:** domain `EarlyLosses` gains `weighedShort`; `earlyLosses` takes each bought animal's first reading and
      counts it with `weighedShort` from 01 and the farm's `arrival_short_percent`; a seller or haat is named when any
      of the four counts is above none; ordered as now, weighed short after diagnosed.
- [ ] **Store:** `early-losses-store.ts` reads each Intake's first Weigh-in (one query, oldest per animal) and the
      farm's line.
- [ ] **Screen:** `home/early-losses.tsx` — `early.line` gains "… · {weighedShort} weighed short", numbers worded in
      Bangla; an answer cached before this ships has no `weighedShort` and reads as none.
- [ ] **Tests:** domain `early-losses.test.ts` (a seller with no losses but two weighed short is named; within the line
      is not) and `routers/early-losses.test.ts` (one more case through the api). **Proved by switching off** the
      widened filter — red.
- [ ] **Somebody opens it** (seed): with 01's bull weighed short, the Owner's farm page names his seller with
      "১টি কম ওজনের".
