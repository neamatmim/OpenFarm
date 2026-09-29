# 01 — An Observation raises work with a clock

**What to build:** Every Observation that is not a Heat raises "See to an unwell animal" for her. It goes to the Manager,
with the Owner's hours as its Grace.

**Blocked by:** —

- [ ] **Glossary:** widen **Observation** ("raises work for the Manager unless it is a Heat; answered by a Diagnosis or
      by that work") and **Trigger** (a new event). Change no Avoid lists.
- [ ] **sop.ts:** add `"observation"` to `FARM_EVENTS` (:158), fired for a standing Observation whose `saw` is not HEAT.
      Widen `recentHappenings` (`instances-store.ts:412`), keyed `observation:<id>` like `heatKeyOf`.
- [ ] **Effect:** generalise `unraiseIfHeat` (`observation.ts:34`) so withdrawing any Observation calls its work off. A
      Correction to a different word calls off the old work and raises new.
- [ ] **Diagnosis:** one with `observationId` calls that work off; a Correction that drops the link raises it again.
- [ ] **Standard Playbook:** `unwellAnimal`, trigger `event: observation`, Manager, Grace from the Owner's hours. Steps:
      "Vet called — coming on (date)"; "Put apart: yes / no pen free"; "Looked again: better / same / worse" ("worse"
      writes an Observation).
- [ ] **Catch-up:** raise only for Observations still inside the Grace.
- [ ] **Tests:** raised on "lame", not on "heat". A Diagnosis calls it off; a withdrawal calls it off. Overdue at the set
      hours, escalated after `escalationMinutes`. **Prove by switching off** the HEAT exclusion (a Heat would raise two).
- [ ] **Somebody opens it:** the Manager's queue with a late one, the Owner's escalation notice, the Vet's list still
      showing it. Both languages.
