# 01 — The monthly Reimbursement

**What to build:** The Farm goes on buying feed and medicine for the whole herd exactly as it does today — nobody splits a sack at the store by whose animal will eat it. Once a month the Owner moves each Venture's consumption from its Venture Account to the Farm's as one **Reimbursement**: what that Venture's Animals ate, what they were dosed with, and their share of the month's **Herd Costs**.

It is both sides of one act: a movement out of the Venture, and a **Money Event** in on the Farm's purse under its own Category. Gross, not netted — the Farm's expense when it bought the feed stands, and the Farm's income when a Venture repays its share stands beside it. This is also how home-grown fodder settles: the **Fodder Price** charged to a Venture's Animals comes back to the Farm as real income through this one door.

And it shows what it is made of — which Feed Items, which doses, which Herd Costs — because an Investor will ask, and a figure the Owner cannot itemise is one she has to defend from memory.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 4, user stories 55, 56, 57; the "Money and the Purse" decisions; `CONTEXT.md` — **Reimbursement**, **Purse**, **Venture Movement**, **Herd Cost**, **Fodder Price**.

- [ ] The Owner reimburses one Venture for one month: what its Animals consumed of feed, medicine and vet, and their share of that month's Herd Costs
- [ ] One act writes both sides — a Venture Movement out of the Venture, and a Money Event in on the Farm's purse under its own Category — and neither exists without the other
- [ ] The figure is what the costing already works out for those Animals over that month, and no second path computes it
- [ ] It shows what it is made of, itemised enough to read to an Investor
- [ ] A month already reimbursed is not reimbursed again, and a month a Venture owned no Animals in reimburses nothing
- [ ] The Owner's alone, audited, from her own phone
- [ ] Tests cover a month's Reimbursement against what the costing says, the two sides landing in the right purses, the Farm's own figures moving by exactly the amount, a second attempt at the same month, and a Role that may not
