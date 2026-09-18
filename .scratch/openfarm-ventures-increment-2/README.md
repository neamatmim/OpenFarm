# Ventures — increment 2: the Venture, its Investors and its capital

Four tickets from [the Ventures spec](../openfarm-investor-projects/spec.md), increment 2. The Venture becomes a record the farm keeps: it opens, it takes capital from Investors who signed for Units, it knows what it holds, and every Money Event says whose money it moved.

No animal belongs to a Venture yet and nothing of a Venture is spent: buying arrives with increment 3. What the advisers say changes Farm Parameters and the Agreement's wording, not the shape built here.

| #   | Ticket                                 | Blocked by |
| --- | -------------------------------------- | ---------- |
| 01  | A Venture opens, and can be called off | —          |
| 02  | The Investors, and what they signed    | 01         |
| 03  | Capital in, and what is left           | 02         |
| 04  | Whose money was it                     | 01         |

Work the frontier — 01 first, then 02 and 04 together — one ticket per `/implement`, clearing context between them. Ticket status lives in each file's `**Status:**` line.
