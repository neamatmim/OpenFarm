# What the place costs — tickets

The Owner asked on 2026-09-27 whether the farm's own expenses (shed rent, salaries, utilities) belong in OpenFarm or an accounting app. The answer, agreed: **record them in OpenFarm, and keep the formal books with the accountant from the monthly export** (spec story 80; double-entry, VAT and a ledger stay out, spec "Out of scope"). OpenFarm already takes these by hand as Money Events. Two gaps were found and the Owner chose how to close them. The vocabulary is the glossary's **Monthly Cost** and **Overhead**.

| #   | Ticket                             | Blocked by |
| --- | ---------------------------------- | ---------- |
| 01  | Monthly Costs: what is not entered | —          |
| 02  | Overheads, per head per day        | —          |

The two tickets are independent. Each ends with somebody opening the page in both languages.

**Settled with the Owner, 2026-09-27, and not to be re-asked:**

- **Which costs are monthly:** the Owner ticks a Category "paid every month", as the charged-to-the-animals tick is. Not a list of fixed costs with amounts and days; and never entered automatically, which would book money nobody paid.
- **Wages:** anybody paid a wage for one month and none for the next is named. No staff list to keep. Someone who leaves is named once, then drops off.
- **Overheads:** a farm-level figure on Costs and Month by month — what the month's overheads came to and what that is per head per day. Not beside each animal, and not "after overheads" on Returns. Every animal and Venture figure stays as it is.

**Settled in drafting:**

- Shed rent becomes a standard Category («শেড ভাড়া»), never the animals', as utilities are; an existing farm is given it the way any missing standard Category is.
- The day from which a month's Monthly Costs are named is a Farm Parameter, the 10th by default, 1–28, the Owner's.
- The per-head divisor counts every Animal on the farm, the Farm's and the Ventures', because the same people and sheds keep them all. The figure is the Farm's, so a Venture is never charged it.
- Monthly Costs show on the Manager's home, because the Manager enters the money, and in the Owner's "needs you" Money group. Tapping one opens the money entry with the Category (and for a wage, the person and month) already filled.
