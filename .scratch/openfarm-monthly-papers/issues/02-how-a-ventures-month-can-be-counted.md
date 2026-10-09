# 02 — How a Venture's month can be counted

Status: resolved

Type: research (AFK)

Blocked by: —

## Question

Nothing on a Venture is counted per month today. From the Venture's own records, what can be said truthfully of one
calendar month on the farm's clock, and how?

- Which records carry a day or instant a month can be cut by: **Venture Movements** (capital in, Buying Float, Advance,
  Reimbursement, sale money, payout), Intakes and purchases, **Sales** and **Internal Sales**, deaths and losses,
  weighings, feed and medicine charges dated inside a **Holding**, Monthly Sums paid.
- Whether a month's costs can be worked the way the **Settlement**, the **Reimbursement** and the **Investor Statement**
  work a Holding (CONTEXT.md: one way for all), so the month's figures can never disagree with the Settlement summed
  over its months.
- Head counts at the month's start and end; weight and gain over the month; the money account's balance at month end
  (does a Bank Check already hold it).
- What the Reimbursement month and the Bank Check month already compute, and whether either is reused.
- Which existing modules and functions to build on (file:line), and any figure that cannot be cut by month honestly.

Findings go to `assets/venture-month-data.md`.

## Answer

Resolved 2026-10-09 by a background research agent; findings in
[`assets/venture-month-data.md`](../assets/venture-month-data.md).

- **Costs cut by month exactly.** The Settlement and the অগ্রগতি cost a Venture through `whatItWasCharged` →
  `chargedTo` (`chargesOfOwner` + `costsOf`, `packages/domain/src/holding.ts`); filtering the Venture's charges to a
  month's moments partitions them, so the months add up to the Settlement unrounded. Rounded per line, months summed may
  differ by paisa: a "run to the end of the month" figure is worked over the whole stretch and rounded once, never summed
  from months. `owedByMonth` already gives the month's Reimbursement.
- **Dated records.** Venture Movements by `moved_on` (a Reimbursement also has `for_month`); Intakes, Sales, deaths,
  weighings and cost lines by their instant; Internal Sales by `sold_on`; whose each was by `ownedThenByOf`
  (`venture-store.ts:1310`). A cash Sale reaches the account on its deposit day, not the sale day.
- **Account at month end.** `balanceAtMonthEnd` (`venture-store.ts:1014`) already works it; the Bank Check keeps the
  bank's reading beside it.
- **Heads and weights need a new "as of a moment" read.** `theirProgress` reads today's state and the latest 30
  weighings; `theirStretch` and `growthOf` take an end moment and are the base.
- **`planAgainstActual`** can be cut to month end for buying, planned growth and running spend; actual weight waits on
  the as-of read; the projection cannot (today's prices, ADR 0010).
- **Not cut by month honestly:** profit and each Unit's share (Settlement only), Margin (a whole life whoever owned
  her), Overheads (never a Venture's), Return on Cost (today's prices), and anything summed from months. A closed month
  can still move with late costs or Corrections: the paper says the books as they stand when printed. An animal sold in
  the month reads her price less `costToItsOwner` (`cost-store.ts:941`).
- **Speed:** month bounds once as instants (`monthOf(startOfFarmDay("M-01"))`), compared by `getTime()`; the Venture's
  charges picked once and cut by month, as `owedByMonth` does.
