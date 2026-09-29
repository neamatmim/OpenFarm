# 03 — Weaning

**What to build:** Weaning, recorded. At 90 days a calf's weaning work is raised with a weigh-in. Weaning her makes a
heifer calf a Heifer and walks a bull calf across to the Fattening Pen the farm named, so he arrives there with his
weight and the day he came. That day is when his fattening story starts.

**Blocked by:** 02

**Status:** not started. DLS weans when a calf eats 1 kg of starter a day for three days, and names 100–120 kg,
which a crossbred calf does not reach by 90 days (about 64 kg at three months). So the weigh-in records her weight and
never gates the weaning; a Step asks "eating 1 kg of starter a day?" and a no is a skip, with its reason, that
raises nothing on its own (research §7).

- [ ] **Glossary:** widen **Weaning** — "recorded by a Step; makes a heifer calf a Heifer and walks a bull calf to
      Fattening" — rather than add a word. Grep `CONTEXT.md` first for anything already saying so.
- [ ] **Schema:** `weaning` (animal, weaned at, weight, completion). One per animal.
- [ ] **A `wean` Step effect** (`STEP_EFFECT_KINDS`, `effects/wean.ts`): per-animal, for a `calf` only. It records the
      Weaning. It moves a female to `heifer`, and a male into the SOP's named Fattening Pen as a cross-side Move (the
      way `stateAfterSideChange` already does). It stands aside for an animal no longer a calf, as every Effect does
      when the farm has moved past it.
- [ ] **Standard Playbook:** "Weaning", triggers `[{ kind: "state", state: "calf", offsetDays: 90 }]`, a weigh-in
      Step, then the wean Step. Its need is the Fattening Pen a weaned bull calf goes to (`STANDARD_SOP_NEEDS`).
- [ ] **Fattening:** a weaned bull calf reads his Days on Feed from his Weaning. The Fattening board already shows a
      weaned male with no Intake (`routers/fattening.ts`); check it now reads the Weaning, and read his price at
      crossing as a crossing from Dairy is read today.
- [ ] **Tests:** raised at 90 days. A heifer calf becomes a Heifer. A bull calf lands in the Pen, on Fattening, with a
      Weigh-in. A calf already moved on is stood aside for. A Correction to the Step undoes it or is sent to Needs
      Review, as `move` and `release` are.
- [ ] **Somebody opens it:** the weaning work, the heifer's page, the bull's page on the Fattening board.
