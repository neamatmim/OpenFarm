# 02 — Heat watch: after calving, and after a service

**What to build:** A list the Manager works from, of each open cow (`milking` or `dry`, no `expectedCalvingAt`) who is
(a) N days past her Calving with no Heat in the last cycle (decision 1), or (b) in the return-heat window of her latest
Attempt with no Heat since and no Pregnancy Check yet. Each row: tag, Pen, days since calving, last heat, reason. In the
Manager's home queue beside Repeat Breeders (`manager-queue.tsx:112-130,325`) and a tab on the Vet page.

**Blocked by:** 01

- [ ] **Glossary:** widen **Heat** (CONTEXT.md:187): "a cow the farm expects in heat and has not seen is on the heat
      watch". No new word.
- [ ] **Domain `heatWatchOf`** (pure, `breeding.ts`), reusing `heatsThatBegin` / `attemptsThatBegin`. A window that is
      a fact about cattle is a constant, as `SAME_HEAT_WITHIN_HOURS` is.
- [ ] **Schema:** Farm Parameter `heatWatchAfterCalvingDays` (Manager); the window too if decision 2 says so.
- [ ] **Tests:** off the list after a heat on day 59; after a service with no heat record (bull); twins; found carrying;
      an Abortion puts her back.
- [ ] **Somebody opens it:** Manager's home and the Vet tab. Both languages.
