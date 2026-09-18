# 04 — Whose money was it

**What to build:** Every Money Event says whose money it moved: the Farm's, or one named Venture's. Everything already recorded reads as the Farm's, so nothing about today's figures changes. The Farm's period report, the money list and the accountant export all read the Farm's purse alone, so that when a Venture starts spending, money that was never the Farm's can never appear as its income or its cost.

Nothing sets a Venture's purse yet — an Intake that names a Venture arrives with the buying increment. This is the shape, put in before it is needed, the way the costing's new parts went in at zero.

**Blocked by:** 01

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 2, user stories 51, 52, 53; [Investors, their shares and the money trail](../../openfarm-investor-projects/issues/06-investors-their-shares-and-the-money-trail.md); `CONTEXT.md` — **Purse**, **Money Event**.

- [x] A Money Event carries a Purse: the Farm's, or one Venture's; everything already recorded is the Farm's, and every existing figure is unchanged to the poisha
- [x] Every reader of the Farm's money — the period report, the money list, the accountant export, the Owner's tiles, the wage rule — reads the Farm's purse alone
- [x] A Venture's own spend is read by Venture, and reaches no report of the Farm's
- [x] The money list says whose purse an entry was, where it is not the Farm's
- [x] Tests cover an existing record's money still reading as the Farm's, a Venture's money kept out of the period report and the accountant export, and the same figures before and after the change

## What was built

- `money_event` carries a **Purse**: unsaid for the Farm's own money, or the Venture whose money it was.
  One nullable column, so everything ever recorded reads as the Farm's and no figure moves.
- The booking door carries it, and leaves it alone on a Correction: whose money it was is not something a
  correction to the amount should quietly change.
- Four readers read the Farm's purse alone, each saying so with the same named predicate: the money list,
  the accountant's export, the money screen's totals, and what the Farm's animals are charged.
- The money list can be asked for one Venture instead — the Owner's alone, like every other Venture
  surface — and a row says whose money it was where it was not the Farm's.

## Two decisions worth reading

- **The Owner's approval queue reads every purse.** The ticket lists "the Owner's tiles" among the readers
  to filter, and the first cut filtered this one too. That was wrong: money waiting for the Owner is not a
  figure, it is work. A Venture's Intake over the Approval Threshold waits for her exactly as the Farm's
  does, and a queue that hid it would leave it waiting for nobody while its alert still fired. It is
  shown, with whose money it is on the row.
- **A wage is the Farm's, and now refused anywhere else.** Scoping the wage rule to the Farm's purse
  needed the Purse in the unique index behind it — and Postgres counts NULLs as distinct, so that would
  have stopped the Farm's own duplicate wages colliding at all: the one thing the index is for. Instead
  the index stands as it was, the check reads every purse, and the booking door refuses a wage that names
  a Venture. The Farm provides the labour; that is the whole of what it brings.

## What the review caught

- **A Manager could read a Venture's money** through the new `ventureId`, a surface no other Venture
  procedure gives them.
- The approval-queue decision above, argued back and changed.
- The glossary had been widened to authorise the code rather than the other way round; the entry now says
  what is settled and the code says what is provisional.
- `purse` on the wire could be `{ id: null }`; the herd-cost and queue filters had no test in either
  direction; and one test leaned on a row another test had inserted.
