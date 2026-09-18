# Ventures — increment 2: the Venture, its Investors and its capital

Four tickets from [the Ventures spec](../openfarm-investor-projects/spec.md), increment 2. The Venture becomes a record the farm keeps: it opens, it takes capital from Investors who signed for Units, it knows what it holds, and every Money Event says whose money it moved.

No animal belongs to a Venture yet and nothing of a Venture is spent: buying arrives with increment 3. What the advisers say changes Farm Parameters and the Agreement's wording, not the shape built here.

| #   | Ticket                                 | Blocked by | Status |
| --- | -------------------------------------- | ---------- | ------ |
| 01  | A Venture opens, and can be called off | —          | done   |
| 02  | The Investors, and what they signed    | 01         | done   |
| 03  | Capital in, and what is left           | 02         | done   |
| 04  | Whose money was it                     | 01         | done   |

**All four are done and merged (2026-09-18.)** What each one built, and what its review caught, is at the foot of its own file.

Left standing for the increments after this one:

- A Venture's own spend, its Buying Float and its payouts read as nothing, and the Venture's figures are already shaped for the day they do not.
- Nothing writes a Venture's Purse yet: an Intake that names a Venture arrives with buying. The money list's Venture view and the register's "whose money" line are reachable by the API but by no screen, because no screen can produce one.
- A Venture's hand-entered cost is charged to nobody today. It belongs to that Venture's own Animals, which is buying's to do.
- The advisers' answers (map ticket 11) change Farm Parameters and the Agreement's wording, not the shape built here.
