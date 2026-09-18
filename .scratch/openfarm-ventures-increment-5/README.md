# Ventures — increment 5: ending

Seven tickets from [the Ventures spec](../openfarm-investor-projects/spec.md), increment 5. A Venture sells what it fattened, and then it ends: the last animals bought back so nobody waits, the sum worked out and blocked until it is not a guess, the figures frozen by the Owner's approval, the money out with a reference against each payment, and whatever arrives late handled without reopening what an Investor has already been shown.

The first two are carried in from increments 3 and 4. They are first because the Settlement reads both: it refuses to close while the bank disagrees, and it freezes figures built on movements that until now could not be put right.

| #   | Ticket                                    | Blocked by |
| --- | ----------------------------------------- | ---------- |
| 01  | Putting a Venture Movement right          | —          |
| 02  | A Bank Check that knows it has gone stale | —          |
| 03  | Selling, and the states that follow       | —          |
| 04  | The buy-back at wind-up                   | 03         |
| 05  | What a Settlement is, and what blocks it  | 02, 04     |
| 06  | Approval, payouts and acknowledgements    | 05         |
| 07  | Settlement Adjustments                    | 06         |

Three roots — 01, 02 and 03 — and then a chain. Work one ticket per `/implement`, clearing context between them. Ticket status lives in each file's `**Status:**` line.

Not here: the three statements an Investor receives, and their Exports (increment 6). Also still standing from increment 3: **what an Animal cost her new owner** is not re-based by an Internal Sale, so a Venture's Margin reads what the previous owner paid. Ticket 05 should decide whether the Settlement's `charged` needs that fixed, since it is the sum an Investor checks.
