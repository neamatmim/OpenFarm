# 04 — Whose money was it

**What to build:** Every Money Event says whose money it moved: the Farm's, or one named Venture's. Everything already recorded reads as the Farm's, so nothing about today's figures changes. The Farm's period report, the money list and the accountant export all read the Farm's purse alone, so that when a Venture starts spending, money that was never the Farm's can never appear as its income or its cost.

Nothing sets a Venture's purse yet — an Intake that names a Venture arrives with the buying increment. This is the shape, put in before it is needed, the way the costing's new parts went in at zero.

**Blocked by:** 01

**Status:** ready-for-agent

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 2, user stories 51, 52, 53; [Investors, their shares and the money trail](../../openfarm-investor-projects/issues/06-investors-their-shares-and-the-money-trail.md); `CONTEXT.md` — **Purse**, **Money Event**.

- [ ] A Money Event carries a Purse: the Farm's, or one Venture's; everything already recorded is the Farm's, and every existing figure is unchanged to the poisha
- [ ] Every reader of the Farm's money — the period report, the money list, the accountant export, the Owner's tiles, the wage rule — reads the Farm's purse alone
- [ ] A Venture's own spend is read by Venture, and reaches no report of the Farm's
- [ ] The money list says whose purse an entry was, where it is not the Farm's
- [ ] Tests cover an existing record's money still reading as the Farm's, a Venture's money kept out of the period report and the accountant export, and the same figures before and after the change
