---
status: accepted
date: 2026-09-26
---

# A Venture opens with a plan, and is measured against the one made before buying

Until now a Venture opened with its money only: target capital, Floor, Units, the two budgets and the Target Window. What the Owner meant to buy with the cattle budget, and what the animals were expected to weigh and fetch, was in nobody's record. The Projection (ADR 0010) held a single buying price, weight and gain, but not in a form anyone could hold a Venture to.

On 2026-09-26 the Owner asked for a Venture to open with its whole plan, so the farm can tell how each Venture is doing. Decided with the Owner:

- **Buying lines by weight band.** Each line is so many animals bought between two weights, at a price a kilo, putting on so much a day. As many lines as the Venture needs. Worked from the middle of each band until the animals are actually bought.
- **Frozen when buying begins, with revisions kept.** Every save is a new version. The last one saved while the Venture was Open is the **baseline**. A change after buying begins is a revision, which needs a reason and does not move the baseline. A plan first made after buying began is its own baseline.
- **The Owner's alone.** Not shown in the Investor Portal until the Owner and the advisers decide. The Projection an Investor may be shown can be worked from it without showing the plan itself.

**Consequences:**

- CONTEXT.md gains **Venture Plan**.
- `venture_plan` and `venture_plan_line` hold the versions; `ventures.plan` and `ventures.setPlan` read and write them.
- `ventures.planAgainstActual` measures a Venture against its baseline: buying per band, growth, money.
- The Projection (ADR 0010) is worked from the latest version of the plan, not the baseline: a projection is what the Owner expects now. Its sale prices are the plan's. A Venture still buying takes what each band has still to buy from the plan, less the animals already bought at a weight inside that band. An animal nobody has weighed since she came grows at her band's planned gain. `ventures.setProjection` is gone, so no figure is typed twice. Prices set before plans existed were kept one step longer, then dropped with `venture_projection` once every such Venture had a plan (the migration refuses otherwise); a Venture with no plan has no projection.
- An animal a Venture takes across by an Internal Sale is bought, from its cattle budget: she counts against the band of what she weighed that day, at what she cost.
- Every animal a projection counts is paid for: what each band has still to buy is charged at the plan's price, whether that comes to more than the cattle budget or less. A plan past its budget is projected lower for it, not as if the budget had bought everything.
- A plan says the share of its animals the Owner expects not to live to be sold (`deaths_percent`, 0 for plans made before it could be said, at most 50). It comes off the low end only — the low end of the projection and of the plan's own planned result — as kilos not sold, never as cost saved; the high end is every animal living. The Owner's decision of 2026-09-26, chosen over the farm's own death history, which is thin while its records are young.
