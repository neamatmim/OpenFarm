# 03 — Weaning

**What to build:** Weaning, recorded. At 90 days a calf's weaning work is raised with a weigh-in. Weaning her makes a
heifer calf a Heifer and walks a bull calf across to the Fattening Pen the farm named, so he arrives there with his
weight and the day he came. That day is when his fattening story starts.

**Blocked by:** 02

**Status:** done. DLS weans when a calf eats 1 kg of starter a day for three days, and names 100–120 kg,
which a crossbred calf does not reach by 90 days (about 64 kg at three months). So the weigh-in records her weight and
never gates the weaning; a Step asks "eating 1 kg of starter a day?" and a no is a skip, with its reason, that
raises nothing on its own (research §7).

- [x] **Glossary:** widen **Weaning** — "recorded by a Step; makes a heifer calf a Heifer and walks a bull calf to
      Fattening" — rather than add a word. Grep `CONTEXT.md` first for anything already saying so.
- [x] **Schema:** `weaning` (animal, weaned at, weight, completion). One per animal.
- [x] **A `wean` Step effect** (`STEP_EFFECT_KINDS`, `effects/wean.ts`): per-animal, for a `calf` only. It records the
      Weaning. It moves a female to `heifer`, and a male into the SOP's named Fattening Pen as a cross-side Move (the
      way `stateAfterSideChange` already does). It stands aside for an animal no longer a calf, as every Effect does
      when the farm has moved past it.
- [x] **Standard Playbook:** "Weaning", triggers `[{ kind: "state", state: "calf", offsetDays: 90 }]`, a weigh-in
      Step, then the wean Step. Its need is the Fattening Pen a weaned bull calf goes to (`STANDARD_SOP_NEEDS`).
- [x] **Fattening:** a weaned bull calf reads his Days on Feed from his Weaning. The Fattening board already shows a
      weaned male with no Intake (`routers/fattening.ts`); check it now reads the Weaning, and read his price at
      crossing as a crossing from Dairy is read today.
- [x] **Tests:** raised at 90 days. A heifer calf becomes a Heifer. A bull calf lands in the Pen, on Fattening, with a
      Weigh-in. A calf already moved on is stood aside for. A Correction to the Step undoes it or is sent to Needs
      Review, as `move` and `release` are.
- [x] **Somebody opens it:** the weaning work, the heifer's page, the bull's page on the Fattening board.

**Built (2026-09-29):**

- `weaning` table (animal, weaned at, weight, to dairy | fattening, completion), one per animal.
- `wean` Step effect (`effects/wean.ts`). The Step's choice is `STAYS_A_HEIFER` or a Pen:
  - a heifer calf → `entersState("heifer")`;
  - a Pen → `walkTo(…, toSide: "fattening")`, which already joins him to a Season, so his Days on Feed count from the
    weaning;
  - a bull calf chosen to stay a heifer is refused (`a_bull_calf_is_no_heifer`);
  - corrected to a skip, it stands aside (`cannot_unwean`) and goes to Needs Review.
- Publish check: a wean Step is per animal and names at least one Pen besides "stays". The editor offers "Stays as a
  heifer" and the farm's Pens.
- Standard "Weaning": state `calf` + 90 days, grace a day. Steps: eating 1 kg of starter (skip "not yet"), weigh
  (30–200 kg), wean. A new Pen need, `weanedBullPen`; `PEN_NEEDS` / `isPenNeed` replace the "calvingPen" checks.
- A work board's animals now carry `sex`, so a weaning job (and the seed) can tell a heifer calf from a bull calf.
- A calf skipped as "not yet" raises nothing on its own: the trigger fires once, so she is weaned by hand later from
  her page (Heifer by State, or a Move across). Say so to the Owner if it matters.
- Proved by switching off: the bull-calf refusal.
- Seed: the stockman weans at three months; a bull calf goes to ষাঁড় পেন ক.
- Checked on the seed farm: six heifer calves weaned at 56–73 kg, Heifers on the Dairy side. No bull calf is 90 days
  old in the seed's three months, so the bull's crossing is proved by the test, not the seed. Upcoming weanings are
  raised ahead with their due days, as quarantine release is.
