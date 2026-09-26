---
status: accepted
date: 2026-09-26
---

# Investors may be shown a labelled Projection of profit, behind the Owner's switch

> Amended by ADR 0011: the sale prices and the buying a Projection is worked from now come from the Venture Plan, not from figures typed for the Projection. A Venture still to buy is charged what its plan's animals cost rather than its whole cattle budget, so an offer is charged its running budget and its plan's cattle, not its whole capital.

ADR 0008 kept the circle closed with "no referrals, no advertising and no projections of return", and CONTEXT.md's **Investor Portal** entry said the portal shows "never ... a price to come or a gain to expect". The lawyer and the Shariah scholar approved the portal in writing on 2026-09-26 on that footing.

On 2026-09-26 the Owner decided to show Investors a **Projection**: what a Venture might make, as a range. It shows on the Ventures they are in, and on the Ventures offered to them. This was chosen against the recommendation to keep facts only. The research behind that recommendation is in [`docs/research/investor-portal-design.md`](../research/investor-portal-design.md) and [`docs/research/bangladesh-pooled-investment.md`](../research/bangladesh-pooled-investment.md). The schemes shut down in Bangladesh all promised a fixed or expected return. A promise of principal or a return is what makes pooled money a deposit, and in a mudarabah profit is a share of what was actually made. The pooled-investment research leaves one opening: a projection "labelled as an estimate and kept apart from contract terms".

So a Projection is built to stay inside that opening:

- **A range, never one figure.** The Owner sets a low and a high sale price a kilo of live weight for each Venture, dated, and changes them as the market moves. Each change is an Audit Event.
- **Worked, never typed.** A running Venture's range is worked from facts:
  - what each standing animal should weigh at the window, at her own whole-stay rate;
  - what its sold animals fetched;
  - what it has been charged, plus the rest of its running budget taken as spent, which errs towards the lower figure.

  A Venture still gathering capital is worked from the Owner's plan: the buying price a kilo, the weight bought at and the gain a day. Its whole cattle budget is spent on animals, and its whole capital is charged. Either way, the profit divides through the Settlement's own `splitOfProfit`.

- **Said as an estimate, with its working.** It is labelled "an estimate, not a promise". The prices and the day they were set are beside it. A loss at the low price is called a loss that comes off capital. On an offer it sits before the rules, so "nothing is guaranteed" is read after it.
- **Never on a paper.** The **Investor Statement** rule stands: no projection is printed on one. The Settlement pays what the herd actually fetched.
- **Behind the Owner's switch.** `farm.investorProjections` is off until the Owner turns it on. The Owner reads every Projection in the Portal Preview meanwhile, and turning it on asks first.

**Consequences:**

- ADR 0008's "no projections of return" gives way to this, and only this. Its "no referrals, no advertising" stands.
- CONTEXT.md gains **Projection** and changes its **Investor Portal** entry to match.
- The written opinions of 2026-09-26 covered the portal without projections. **The switch stays off until the lawyer and the Shariah scholar have seen the Projection's wording.**

**Revisit** if either adviser objects. If one does, the switch goes off, which takes the Projection out of every Investor's portal at once. The Owner's own figures stay on the Owner's page.
