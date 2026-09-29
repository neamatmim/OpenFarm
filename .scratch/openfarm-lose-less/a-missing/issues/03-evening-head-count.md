# 03 — The evening Head Count

**What to build:** Each Pen counted by number, blind. Compared with the animals the register puts in that Pen at that
moment; a difference sends the Manager to walk the Pen.

**Blocked by:** 01

- [ ] **Glossary:** new word **Head Count** — not a widening of **Stock Count**, since "stock" is on Animal's Avoid list
      (CONTEXT.md:35); "headcounts" already appears under Mortality (:127). Borrow Stock Count's blind count and
      difference-against-the-register-as-it-stands.
- [ ] **Schema:** `head_count` (pen, counted, expected, completion, at).
- [ ] **Effect `head_count`** in `STEP_EFFECT_KINDS` (`sop.ts:101`), `number` evidence. Expected = the Pen's live
      animals when counted.
- [ ] **Notice:** `head_count_differs` to the Manager with the Pen's tags. A shortfall opens nothing by itself: the
      Manager marks which animal is Missing.
- [ ] **Standard Playbook:** "Evening head count", a per-Pen schedule (`dueSlotsFor`, `instances-store.ts:156`), with a
      real trigger.
- [ ] **Corrections:** a recount rewrites the row and compares again.
- [ ] **Tests:** blind; one short; one over (an unrecorded calf); counted after a Move.
- [ ] **Somebody opens it:** the count on a Shed Phone, the Manager's notice. Both languages.
