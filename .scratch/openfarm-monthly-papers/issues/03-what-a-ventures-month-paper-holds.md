# 03 — What a Venture's month paper holds

Status: resolved

Type: grilling

Blocked by: 02

## Question

Given what can be counted per month (02), what does the paper for one month of one Venture say, for the Owner alone?

- **Its parts**: money in and out of the Venture Account that month; animals at the start and end, bought, sold, died,
  lost; weight and gain; feed, medicine and other charges; the plan against what happened (the Venture Plan is the
  Owner's alone, ADR 0011, so it may appear); Monthly Sums due and paid, for a Venture paid by the month.
- **To date or only the month**: whether each part shows the month alone, the run to the end of the month, or both.
- **No Projection** on a paper (ADR 0010), even one only the Owner reads? A return as a share, never a rate a year
  (ADR 0012).
- **Export or not**, who may print it, language and look — as decided for the Farm's paper in 01, unless a Venture's
  paper needs otherwise.
- **Where it is reached**: the Venture page with a month selector, limited to the months the Venture ran.
- **Its name**, checked against CONTEXT.md, and kept apart from the **অগ্রগতি**.

## Answer

Resolved 2026-10-09 by Claude on its recommendation, as the Owner delegated (map Notes), on the research in 02
([`assets/venture-month-data.md`](../assets/venture-month-data.md)).

1. **Name.** A Venture's **Monthly Report**: «মাসিক প্রতিবেদন — কোরবানি ২০২৭ ভেঞ্চার — অক্টোবর ২০২৬» / "Monthly report —
   Korbani 2027 Venture — October 2026". One term with the Farm's, said for whom; never the **অগ্রগতি**, which is an
   Investor's paper. CONTEXT.md's entry widened.
2. **Two columns: the month, and the run to the end of it** — not the month before, as the Farm's has. A Venture is a run
   with an end, so its question is how far along it is; the Farm goes on, so its question is how this month did. The
   run-to-date figures are worked over the whole stretch and rounded once, never added up from the months.
3. **Its parts**, each saying "nothing this month" where it has nothing (a Venture still gathering has only money):
   - **Animals**: heads at the start, bought (Intakes and Internal Sales in), sold, died, lost, at the end; kg weighed
     and the herd's gain a day over the month; the average weight at the month's end — from a new as-of read built on
     `theirStretch` + `growthOf`, every weighing read.
   - **Charges** by the Settlement's own lines (`chargesOfOwner` + `costsOf` / `roundedCosts`, cut to the month), so the
     month and the Settlement can never disagree.
   - **Money**: the Venture Account at the month's start (`balanceAtMonthEnd` of the month before), each kind of
     Venture Movement in the month (capital in, Buying Float, Advance, Reimbursement, sale money, refunds, payout), and at
     its end; beside it the month's **Bank Check** — the bank's reading, matched, differing, stale, or not done.
   - **Reimbursement** owed to the Farm for the month (`owedByMonth`).
   - **Sold in the month**: a row an animal — tag, day, price, her cost to the Venture (`costToItsOwner`), and price less
     cost. Not called Margin, which is a whole life whoever owned her.
   - **Against the plan, to the month's end**: heads and money bought, and running spend, against the **Venture Plan**
     (the Owner's alone, ADR 0011, so it may show here); the plan's growth against the weight actually reached.
   - **Monthly Sums**, for a Venture paid by the month: due, paid and missed to the month's end (`monthlySumsOf` +
     `sumsStandingOf`, paid money from `capital_in` up to the month's end).
   - **Left out**, in a closing line: profit and each Unit's share (only at Settlement), Margin, Overheads (never a
     Venture's), Return on Cost and any Projection (ADR 0010: never on a paper, whoever reads it), and that the paper says
     the books as they stand when printed — a late cost or a Correction can still move a closed month.
4. **The same as the Farm's (01) otherwise**: the Owner's alone; a `PaperDocument` on the Farm Identity letterhead read in
   Bangla or English (ADR 0021); an **Export** with its Audit Event (`monthly_report`, the Venture and the month in it),
   refused without the Registration number; and **a CSV too** — one row a figure: `part`, `line`, `this month`, `to the
   month's end`, `note` — since the machinery is the Farm's and a Venture's books are what an auditor would ask for.
5. **Where.** `/ventures/$ventureId/months/$month`: the month on screen, a selector of the months the Venture ran (opened
   to settled or called off, never one to come), Print and Download CSV. Reached from the Venture page («মাসিক
   প্রতিবেদন», opening its latest month) and from the Farm's month page, which lists the Ventures running that month as
   links on screen — not on its paper.

**Why:** the research shows every part can be cut to a month from records the Venture already keeps, by the functions the
Settlement itself uses, except the head and weight read, which is new and the paper's largest piece of work; and the
excluded figures are exactly those that cannot be told of a month honestly.
