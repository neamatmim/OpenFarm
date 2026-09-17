# 06 — Herd costs reach the animals standing that month

**What to build:** Some spending is for the animals but names none of them: a Vet visit to the fattening pens that named nobody, lab tests, fly spray, a dewormer not given as a dose. Today it is charged to nobody. The Owner marks a Category, once, as charged to the animals of its Side; the Manager keeps entering money exactly as now, picking a Category and a Side; and each month that Category's hand-entered money splits across the Animals of that Side by the days each stood on the farm that month — so an animal who arrived on the 20th pays for ten days, not thirty.

Wages, utilities, repairs, shed hygiene and equipment are never marked: they are the place and the people, and they stay the Farm's.

**Blocked by:** 01

**Status:** ready-for-agent

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 1, user stories 42–46; [What a project is charged for](../../openfarm-investor-projects/issues/05-what-a-project-is-charged-for.md); `CONTEXT.md` — **Herd Cost**, **Category**, **Pen Spell**.

- [ ] A Category carries the Owner's mark, "charged to the animals of its Side"; setting or clearing it is the Owner's alone and audited, and the standard Categories start unmarked
- [ ] Nothing about entering money by hand changes for the Manager: the same Category and Side, the same receipt photo, the same approval rule
- [ ] A marked Category's hand-entered money for a month splits across the Animals of its Side by the days each stood on the farm in that month; money with no Side reaches nobody
- [ ] An Animal who arrived or left mid-month carries only her days; an Animal who left before the month carries none
- [ ] The share shows on her page and in the per-Side report's Herd Cost line, and comes off her Margin and Cost of Gain
- [ ] Marked money of a month with no animals standing on that Side is charged to nobody and said out loud
- [ ] Tests cover an unmarked Category reaching nobody, a marked one split across two animals with different days, a mid-month arrival, and a month with nobody standing
