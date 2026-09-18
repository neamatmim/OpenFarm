# 06 — Approval, payouts and acknowledgements

**What to build:** The Owner approves the Settlement as one act, and that act freezes the figures: what an Investor is shown afterwards is what he was shown then, whatever else the farm learns later. The computed figures are written down as they stood, because the whole point of approving is that they stop moving.

Then the money goes out. Each payout is recorded with the day and its bank reference, so that "I never got it" has an answer that is not somebody's memory. As each Investor confirms, the Owner records his acknowledgement, and the file shows who has confirmed and who has not. The last payout moves the Venture to **Settled** — a fact, not a chore.

**Blocked by:** 05

**Status:** ready-for-agent

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 5, user stories 68, 69, 70, and story 59's "Settled on its last payout"; `CONTEXT.md` — **Settlement**, **Venture**, **Venture Movement**.

- [ ] Approving is one act that writes the figures down as they stood and is audited as the Owner's
- [ ] After approval the figures do not move, whatever the costing would now say
- [ ] Each Investor's payout is recorded with the day and its bank reference, by bank like every movement of a Venture's money
- [ ] A payout is refused before approval, refused twice for one Investor, and refused for more than he is owed
- [ ] An acknowledgement is recorded against an Investor's payout, and the Venture shows who has confirmed
- [ ] The last payout moves the Venture to Settled by itself
- [ ] Tests cover approval freezing a figure the costing would otherwise change, a payout with its reference, the three refusals, an acknowledgement, and the last payout settling the Venture
