# 02 — Home-grown fodder costs what it is worth

**What to build:** The Owner sets a price per kilogram on a home-grown Feed Item — roughly what buying it would cost. From then on a Harvest enters the store at that price instead of at nothing, joins the weighted average like any purchase, and the animals that eat the mix are charged for it. The fields are still the Farm's, but what grows on them is no longer free to whoever eats it, so a Venture's animals can never be fed for nothing at the Farm's expense.

No money moves: a Harvest still makes no Money Event, because the Farm paid nobody. Harvests already in the store keep the nothing they came in at, and the feed report says how much fodder is still unpriced.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 1, user stories 37, 38, 47; [What a project is charged for](../../openfarm-investor-projects/issues/05-what-a-project-is-charged-for.md); `CONTEXT.md` — **Fodder Price**, **Harvest**, **Stock Count**.

- [ ] A Feed Item carries a Fodder Price per kg, set and changed by the Owner alone and audited; a Feed Item without one behaves exactly as today
- [ ] A Harvest takes the Fodder Price in force when it is recorded — from the Feed Item, never typed by the person recording it — and is an ordinary priced lot in the weighted average from then on
- [ ] A Harvest still writes no Money Event, and the Farm's period report and accountant export are unchanged by one
- [ ] Harvests recorded before this ships stay at no price; the feed report shows the unpriced kg rather than hiding them
- [ ] A Pen fed a mix of bought feed and priced fodder is charged the blended price, and its animals' Margin moves accordingly
- [ ] A Stock Count finding less than the store should hold still charges nobody — the loss stays the Farm's
