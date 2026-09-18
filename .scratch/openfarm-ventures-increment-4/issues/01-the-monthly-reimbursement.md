# 01 — The monthly Reimbursement

**What to build:** The Farm goes on buying feed and medicine for the whole herd exactly as it does today — nobody splits a sack at the store by whose animal will eat it. Once a month the Owner moves each Venture's consumption from its Venture Account to the Farm's as one **Reimbursement**: what that Venture's Animals ate, what they were dosed with, and their share of the month's **Herd Costs**.

It is both sides of one act: a movement out of the Venture, and a **Money Event** in on the Farm's purse under its own Category. Gross, not netted — the Farm's expense when it bought the feed stands, and the Farm's income when a Venture repays its share stands beside it. This is also how home-grown fodder settles: the **Fodder Price** charged to a Venture's Animals comes back to the Farm as real income through this one door.

And it shows what it is made of — which Feed Items, which doses, which Herd Costs — because an Investor will ask, and a figure the Owner cannot itemise is one she has to defend from memory.

**Blocked by:** None — can start immediately.

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 4, user stories 55, 56, 57; the "Money and the Purse" decisions; `CONTEXT.md` — **Reimbursement**, **Purse**, **Venture Movement**, **Herd Cost**, **Fodder Price**.

- [x] The Owner reimburses one Venture for one month: what its Animals consumed of feed, medicine and vet, and their share of that month's Herd Costs
- [x] One act writes both sides — a Venture Movement out of the Venture, and a Money Event in on the Farm's purse under its own Category — and neither exists without the other
- [x] The figure is what the costing already works out for those Animals over that month, and no second path computes it
- [x] It shows what it is made of, itemised enough to read to an Investor
- [x] A month already reimbursed is not reimbursed again, and a month a Venture owned no Animals in reimburses nothing
- [x] The Owner's alone, audited, from her own phone
- [x] Tests cover a month's Reimbursement against what the costing says, the two sides landing in the right purses, the Farm's own figures moving by exactly the amount, a second attempt at the same month, and a Role that may not

## What was built

- The month's figure: what a Venture's Animals ate of the Farm's feed, were dosed with, cost in vet
  visits, and their share of the month's Herd Costs — the same costing every other reader uses, narrowed
  to those Animals and those days.
- Itemised by name: which Feed Items, which medicines, which Categories of Herd Cost, shown in the sheet
  under the total each belongs to, so the Owner reads it aloud rather than defending it from memory.
- One act writes both sides: a Venture Movement out, and a Money Event **in** on the Farm's purse under
  its own Category. Gross — the Farm's expense when it bought the sack stands, and this stands beside it.
- Off the Running Budget, not the Cattle Budget: it is the cost of keeping the animals, not of buying one.
- Once per Venture per month, and only once that month is over.

## What the reviews caught

- **A month was charged to whoever owned the animal today**, not to whoever owned her the day she ate.
  An Internal Sale mid-month would have made the buying Venture repay days the seller's animals ate —
  and because a month can only be reimbursed once, the wrong answer would have been permanent. Ownership
  is now reconstructed from the Internal Sales walked back from where she stands.
- **The figure could move between the Owner reading it and committing to it.** She now sends the figure
  she read, and a Feeding entered late or a Category re-marked in between is refused rather than quietly
  charged.
- **A count that was not a count:** the breakdown reported shares, so one feeding of one item to three
  animals read as three sacks. Dropped — the Owner reads taka, and a wrong number is worse than none.
- Four lines that need not add to the total beneath them, a settled or called-off Venture that could
  still be charged, a month still running that could be reimbursed and then locked out for good, and a
  default month read off UTC that on the first of the month in Dhaka offered the month before last.
- Two refusals had no word the reader has.

## The costing core changed

`feedShares` now emits one share per feed item per animal rather than one per feeding, so a month can be
read back as the sacks that made it. The sum is the same products added in a different grouping, the 25
existing costing tests still pass unchanged, and there is now a test of a mixed pen — two items, two
animals, one of them the Venture's — which is the case a single-animal single-item test could never
have caught.
