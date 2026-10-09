# Monthly papers — spec

Map: [`map.md`](./map.md). Decided in [01](./issues/01-what-the-farms-month-paper-holds.md),
[02](./issues/02-how-a-ventures-month-can-be-counted.md) and [03](./issues/03-what-a-ventures-month-paper-holds.md);
the Owner delegated every design choice (2026-10-09). Build tickets: 05–11.

## Problem

The Owner wants to print or download one chosen month: the Farm's, for themselves and the accountant, and a Venture's, for
themselves. The **Monthly Report** shows twelve months side by side with no single month, no print and no download, and
nothing about a Venture is counted per month.

## What is built

### The Farm's month (05–07)

- **A page a month**, `/monthly-report/$month` (`YYYY-MM`), the Owner's alone. Each month on the monthly report (table row
  and phone card) links to it; a selector moves between the months the farm has kept, never one to come. The current
  month reads "so far, to {today}". It lists the Ventures running that month as links to their months (on screen only).
- **Two columns**: the month and the month before.
- **Parts**, all from `figuresOver` (`month-store.ts`), plus `summarizeMoney` over the month:
  - money: in, out, net; by Category and by Side; awaiting Money Events counted in and said;
  - dairy: milk sold and liters, a liter fetched, charged, liters to Bulk, liters a cow milked a day, cost a liter;
  - fattening: charged, sold, Margins;
  - overheads, and a head a day;
  - a closing line: unpriced kg and uncosted doses, left out, never zero; and a line that each Venture keeps its own
    accounts.
- **Print**: a `PaperDocument` on the Farm Identity letterhead, read in Bangla or English (ADR 0021), through
  `PaperDialog`.
- **CSV**: one row a figure, as the accountant's own file names things — `part`, `part_en`, `line`, `line_en`, `way`,
  `this_month`, `month_before` — numbers as numbers, named by `stampedFileName`, built with `toCsv` (amended in 07).
- **Export**: the paper and the CSV each recorded by `recordExport` as `monthly_report` with the month and format;
  refused without the Registration number (`assertRegistered`).

### A Venture's month (08–11)

- **A page a month**, `/ventures/$ventureId/months/$month`, the Owner's alone, reached from the Venture page («মাসিক
  প্রতিবেদন», its latest month) and from the Farm's month page. A selector of the months the Venture ran (opened to
  settled or called off, never one to come).
- **Two columns**: the month, and the run to its end — worked over the whole stretch and rounded once, never summed from
  months.
- **Parts**, each saying "nothing this month" when empty:
  - animals: heads at the start, bought (Intakes, Internal Sales in), sold, died, lost, at the end; kg weighed, the herd's
    gain a day, average weight at the end — from a new **as-of read** (08);
  - charges by the Settlement's own lines (`chargesOfOwner` + `costsOf` / `roundedCosts`, cut to the month);
  - the Venture Account: opening (`balanceAtMonthEnd` of the month before), each kind of Venture Movement by `moved_on`,
    closing; the month's Bank Check — matched, differing, stale or not done;
  - the Reimbursement owed to the Farm for the month (`owedByMonth`);
  - each animal sold in the month: tag, day, price, her cost to the Venture (`costToItsOwner`), price less cost — never
    called Margin;
  - against the Venture Plan to the month's end: heads and money bought, running spend, planned growth against weight
    reached;
  - Monthly Sums for a Venture paid by the month: due, paid, missed to the month's end;
  - a closing line: no profit, share, Margin, Overheads, Return on Cost or Projection (ADR 0010); the books as they stand
    when printed.
- **Print, CSV, Export**: as the Farm's; the CSV's columns `part`, `line`, `this month`, `to the month's end`, `note`; the
  Export names the Venture.

## Rules

- The Owner's alone (`OWNER_ONLY`, `requirePersonalSession`), both pages and every act.
- A month is a calendar month on the farm's clock; its bounds are worked once as instants (`monthOf(startOfFarmDay(...))`)
  and compared by `getTime()`, never `farmDayOf` per row ([[slow-per-row-farm-day]]).
- A month still to come is refused; a month before the farm (or the Venture) kept anything reads empty, not refused.
- The figures are read as they stand: no month is frozen.

## Testing

- API tests at the procedures: each part's figures for a seeded month against hand-worked numbers; the month before; the
  current month "so far"; a refused month to come; the Owner alone (the Manager refused); the Export written with its
  month and format; refused without the Registration number.
- A Venture's months summed over a settled run match the Settlement's charges within paisa, and its run-to-date column
  equals the Settlement's to the paisa (the research's partition).
- The as-of read: heads and weights at a past instant across an Intake, a Sale, a death and an Internal Sale, and an
  animal weighed after the instant not counted.
- Domain tests for each paper's layout and its text in both languages (`paperText`), and the CSV's rows.
- Open both pages in the browser in both languages before calling a ticket done ([[screens-meet-old-cached-answers]]).

## Out of scope

An Investor's monthly paper (they have the **অগ্রগতি**); a server-made PDF or sending a paper; periods other than a
calendar month; offering a month's paper when the month closes, in the Digest or on the home panels.
