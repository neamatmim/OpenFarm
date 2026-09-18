# 04 — The Internal Sale

**What to build:** The Owner sells an Animal between the Farm's herd and a Venture as an **Internal Sale**: priced at the Animal's latest Weigh-in times a live-weight rate she enters that day, with a note of where the rate came from, so that value moves at a price she can defend to an Investor years later. The money actually moves through the Venture Account — it is a sale, not a book entry — and the Animal's owner changes with it.

It is refused once the Venture is Selling or the Animal is Ready for Sale, so a finished bull cannot be lifted out of the pool at the moment it becomes worth having. Hers alone, and audited: nobody else moves animals between the purses.

**Blocked by:** 01 (an Animal has an owner)

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 3, user stories 33, 34, 35, 36; `CONTEXT.md` — **Internal Sale**, **Venture Movement**, **Weigh-in**, **Ready for Sale**.

- [x] The Owner records an Internal Sale in either direction, priced from the Animal's latest Weigh-in and a live-weight rate she enters, with a note of where the rate came from
- [x] The price is what the weight and the rate make it, shown before she commits, and an Animal with no Weigh-in is refused
- [x] The money moves through the Venture Account as Venture Movements — out of the buyer's side, and where both sides are Ventures, into the seller's
- [x] The Animal's owner changes on the same act, and nothing else changes it
- [x] Refused once the Venture is Selling, refused for an Animal that is Ready for Sale, and refused for a Dairy animal, each with a word the reader has
- [x] The Owner's alone and audited, with the weight, the rate and the note on the trail
- [x] Tests cover a sale each way, the price from the latest Weigh-in rather than an older one, the three refusals, and a Role that may not

## What was built

- An Animal sold between the Farm's herd and a Venture, or between two Ventures: priced at her latest
  Weigh-in times a rate the Owner enters, with a note of where the rate came from — asked for, not
  offered. The Owner confirms the price she read, and a weight taken since is refused rather than
  silently charged.
- The money moves through the Venture Account by bank, with its own reference. Where the Farm is a side
  it is also a **Money Event** on the Farm's purse: a cattle sale when the Farm lets her go, a cattle
  purchase when it takes her on. Between two Ventures no money of the Farm's has moved and its books say
  nothing.
- A Venture pays out of what its Cattle Budget is holding, exactly as it would at the haat.
- Her owner changes in the same act, and the whole thing runs inside one transaction behind the lock
  every count of a Venture's money takes.
- Refused for a Dairy cow, for an Animal not bought in, for one Ready for Sale, for a Venture past
  trading (saying which side), and for one she already belongs to.

## Two decisions the Owner made

- **The Farm's side reaches the Farm's books.** Both reviewers argued the spec's list of exemptions does
  not name the Internal Sale, and that the farm really does receive taka for a bull. Without it the
  animal's original cost would sit in the books with no matching income.
- **What she cost her new owner is left for the settlement work.** The money is right now; the costing
  re-base — so a Venture's Margin reads what it actually paid rather than what the previous owner did —
  belongs with increment 5, where Margin and Cost of Gain are worked out.

## What the reviews caught

- **A Venture could buy an animal it could not pay for**, taking its balance and its Cattle Budget
  negative, which no other path allows.
- **The whole act ran outside its own transaction**: a double submit would have written two sales and
  charged twice while changing her owner once.
- **The sheet and the server could disagree on the price** if she was weighed between the Owner reading
  the figure and committing to it.
- **The Dairy refusal was conflated** with home-bred animals and untested; the selling-Venture refusal
  was never exercised; and the two-Venture case never ran at all.
- **CONTEXT.md contradicted itself**: the Wind-up Period had the Farm buy the remainder "as an Internal
  Sale", which this ticket's own bar makes impossible. The wind-up buy-back is its own act at a fixed
  moment, and the glossary now says so.
- A schema cycle, once by me and once caught by the linter: an Internal Sale is an Animal's record, and
  it now lives with the fattening ones where its links do not go round in a circle.

## Left standing

- **No correction of an Internal Sale.** A mistyped rate is permanent, and it has moved real money and
  changed ownership. Worth a ticket of its own.
