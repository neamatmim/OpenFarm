# Ventures — increment 4: living

Three tickets from [the Ventures spec](../openfarm-investor-projects/spec.md), increment 4. A Venture's animals are standing in the sheds eating the Farm's feed, and this is how the money keeps up with them month by month: what they consumed comes back to the Farm, the Owner is warned before the Running Budget runs dry, and the bank is checked against the books while a mistake is still fresh.

| #   | Ticket                                       | Blocked by | Status |
| --- | -------------------------------------------- | ---------- | ------ |
| 01  | The monthly Reimbursement                    | —          | done   |
| 02  | The Running Budget runs low, and the Advance | —          | done   |
| 03  | The monthly bank check                       | —          | done   |

**All three are done and merged (2026-09-18.)** What each built, and what its review caught, is at the foot of its own file.

Left standing for the increments after this one:

- **Nothing recomputes a Bank Check.** A movement back-dated into a checked month leaves the Venture saying the month agreed against a figure the farm no longer believes.
- **No correction of a Venture Movement.** A mistyped Advance or capital figure is permanent; the Bank Check is what catches it, but nothing puts it right.

Carried in from increment 3, and not this increment's:

- **No correction of an Internal Sale.** A mistyped rate is permanent, and it has moved money and changed ownership. Its own ticket, whenever it is taken.
- **What an Animal cost her new owner** is not re-based by an Internal Sale. Increment 5's, with Margin and Cost of Gain.

Not here: Selling, the Wind-up Period, the buy-back, the Settlement and the payouts (increment 5); the three statements (increment 6).
