# Ventures — increment 3: buying

Four tickets from [the Ventures spec](../openfarm-investor-projects/spec.md), increment 3. A Venture stops being a plan with money in it and starts owning cattle: the Float goes to the haat, every Animal knows whose she is, her costs land in her owner's purse, and animals move between the Farm and a Venture only at a price the Owner can defend.

This is where the Purse gets its first writer and a Venture's spending stops reading as nothing.

| #   | Ticket                                                    | Blocked by |
| --- | --------------------------------------------------------- | ---------- |
| 01  | An Animal belongs to a Venture, and her money follows her | —          |
| 02  | The Buying Float goes out                                 | —          |
| 03  | The Float comes home                                      | 01, 02     |
| 04  | The Internal Sale                                         | 01         |

Two roots: 01 and 02 can be taken in either order, or together. Work the frontier one ticket per `/implement`, clearing context between them. Ticket status lives in each file's `**Status:**` line.

Not here: the monthly Reimbursement, the Running Budget warning and the Advance (increment 4); Selling, the Settlement and the payouts (increment 5).
