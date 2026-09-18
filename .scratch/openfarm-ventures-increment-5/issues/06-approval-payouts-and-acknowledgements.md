# 06 — Approval, payouts and acknowledgements

**What to build:** The Owner approves the Settlement as one act, and that act freezes the figures: what an Investor is shown afterwards is what he was shown then, whatever else the farm learns later. The computed figures are written down as they stood, because the whole point of approving is that they stop moving.

Then the money goes out. Each payout is recorded with the day and its bank reference, so that "I never got it" has an answer that is not somebody's memory. As each Investor confirms, the Owner records his acknowledgement, and the file shows who has confirmed and who has not. The last payout moves the Venture to **Settled** — a fact, not a chore.

**Blocked by:** 05

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 5, user stories 68, 69, 70, and story 59's "Settled on its last payout"; `CONTEXT.md` — **Settlement**, **Venture**, **Venture Movement**.

- [x] Approving is one act that writes the figures down as they stood and is audited as the Owner's
- [x] After approval the figures do not move, whatever the costing would now say
- [x] Each Investor's payout is recorded with the day and its bank reference, by bank like every movement of a Venture's money
- [x] A payout is refused before approval, refused twice for one Investor, and refused for more than he is owed
- [x] An acknowledgement is recorded against an Investor's payout, and the Venture shows who has confirmed
- [x] The last payout moves the Venture to Settled by itself
- [x] Tests cover approval freezing a figure the costing would otherwise change, a payout with its reference, the three refusals, an acknowledgement, and the last payout settling the Venture

## What was decided while building

**The Farm's share leaves the account.** The first version left it sitting there, on the reasoning that the Venture Account is in the Owner's name so the Farm's share is already hers. A review overturned it with the glossary's own words — **Venture Account**: "The Farm's own money never passes through it" — and the observation that the same reasoning would make repaying the Owner's Advance unnecessary, which it plainly is not. So `takeTheFarmsShare` sends it out on its own movement and a settled account reads zero.

**The account is sealed at approval, not at settled.** Between approving and the last payment the Venture is still Selling, and `advance`, `reimburse`, `drawFloat`, `reconcileFloat` and the wind-up buy-back would all still have moved money — leaving the frozen figures describing an account that no longer existed. All six now refuse with `already_approved`.

**The Owner's Advance comes back before any capital does**, enforced rather than merely intended: `paySettlement` refuses while it is still out.

**A Settlement with nothing to pay settles on approval**, rather than waiting for a payment that will never be made.

**Acknowledged once.** A second would write over the day he said it and whatever he said.

**One finding that turned out not to exist.** A review predicted that one Investor holding two Agreements on one Venture would crash approval on a unique-index violation. Tested: it cannot happen — `investment_agreement_uidx` already forbids two Agreements for one Investor on one Venture. The shares are keyed on the Agreement anyway, because that is what a share is of.

**Left undone:** no screen. Everything here is API-only, and nothing renders the approved figures, who has been paid or who has confirmed.
