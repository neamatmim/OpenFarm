# Ventures — increment 4: living

Three tickets from [the Ventures spec](../openfarm-investor-projects/spec.md), increment 4. A Venture's animals are standing in the sheds eating the Farm's feed, and this is how the money keeps up with them month by month: what they consumed comes back to the Farm, the Owner is warned before the Running Budget runs dry, and the bank is checked against the books while a mistake is still fresh.

| #   | Ticket                                       | Blocked by |
| --- | -------------------------------------------- | ---------- |
| 01  | The monthly Reimbursement                    | —          |
| 02  | The Running Budget runs low, and the Advance | —          |
| 03  | The monthly bank check                       | —          |

All three are roots and may be taken in any order, though 01 makes 02's warning easy to demonstrate, since a Reimbursement is what draws the Running Budget down. Work one ticket per `/implement`, clearing context between them. Ticket status lives in each file's `**Status:**` line.

Carried in from increment 3, and not this increment's:

- **No correction of an Internal Sale.** A mistyped rate is permanent, and it has moved money and changed ownership. Its own ticket, whenever it is taken.
- **What an Animal cost her new owner** is not re-based by an Internal Sale. Increment 5's, with Margin and Cost of Gain.

Not here: Selling, the Wind-up Period, the buy-back, the Settlement and the payouts (increment 5); the three statements (increment 6).
