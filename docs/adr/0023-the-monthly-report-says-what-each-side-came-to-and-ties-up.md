---
status: accepted
date: 2026-10-09
---

# The Monthly Report says what each Side came to, what the Farm holds and what it ties up

On 2026-10-09 the Owner asked for more management figures on the monthly report: a cash flow summary, receivable aging, month-on-month comparison, margin percentages, ROI and capital employed. The aim was to understand "profitability, cash position, working-capital risk, and the performance of each business segment over time". The Owner said to go with Claude's recommendation. This ADR records that recommendation. The plan is in `.scratch/openfarm-management-figures/spec.md`.

**The report stays the Owner's, and says no "profit".** OpenFarm keeps cash books and the Farm's records. The accountant keeps the full books. So each new figure is named for what it is made of (CONTEXT.md: **Side Result**, **Cash Position**, **Capital Employed**), and none of them claims to be the Farm's profit.

- **A Side is the segment.** The Dairy side's month is the milk it sold against the month's charges to its animals. The Fattening side's is the Margins of the Farm's own animals sold in the month, against their sale prices. Those are the figures the report already showed. The new part is the Overheads, shared out by the days the Farm's own animals stood on each Side. The Ventures' animals' days are a line of their own, borne by the Farm, so the shares add up to what was spent. This is the one place an Overhead is shared out. No Margin, Cost of Gain, Return on Cost or Settlement carries one.
- **Margins are percentages of what came in**, to one decimal, before and after the Overheads. Return on Cost keeps its own "for every hundred taka" and its own runs.
- **Capital is at cost, never at today's price.** A fattening animal is stock: her price and every charge to her. A dairy animal is the herd: her entry price, plus what she was charged until she first calved. After that her keep is the milk's cost. The other capital is the Farm Capital in Ventures still running, the store at its prices, and what buyers owe. Cash is not capital tied up; it is the Cash Position. A price-based figure would move with the market and say nothing about what the Farm put in. What the animals would fetch today is not repeated on the month: the Returns page already sets each Season and the herd at today's prices, and the report's text points there. A past month could not say it anyway, because no past price is kept.
- **A month's return on capital is a Side's**: its Result after Overheads over the mean of its capital at the month's start and end. It is never put a year, because a month of a Season says little of its whole. The Ventures' return comes at Settlement and is never a month's figure.
- **The cash flow always adds up.** Where the month began, money in, money out and where it ended are four figures from different stores. The **difference** between them is shown on its own line, named for what makes it: a Cash Count's difference, money booked to nobody's hand, an account read for the first time. The alternative was to force the books to balance, and that would hide the very thing a Cash Count exists to find.
- **Receivables are aged by the days since they left**, as an accountant ages invoices, and the overdue part is said beside the ages. Overdue is by the promise, and the promise is what the farm chases.
- **Return on Cost is not a month's.** It is shown as it stands today on the year page, beside the months, and links to Returns. It is not printed on a month's paper, because it would be today's figure on a past month.

**Consequences:**

- CONTEXT.md gains **Side Result**, **Cash Position** and **Capital Employed**. The **Overhead** and **Receivable** entries say how the report uses them.
- `MonthFigures` grows a Summary, Side Results, a position at the month's end (cash, Receivables by age, the store, Capital Employed) and the cash flow. The paper and the CSV read the same parts, as before.
- Nothing is stored and nothing is migrated. Every figure is worked out on read from what the farm already keeps.
