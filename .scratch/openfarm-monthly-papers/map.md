# OpenFarm monthly papers — map

Label: wayfinder:map

Tracker: local-markdown (`.scratch/openfarm-monthly-papers/`)

Charted: 2026-10-09

## Destination

A spec at `spec.md`, with numbered build tickets under `issues/` after the decision tickets, for printing and
downloading **one chosen month** of the farm's report: the Farm's month, and one Venture's month. The map is done when
nothing is left to decide and the build tickets can be taken one by one.

## Notes

- **The Owner delegated the decisions (2026-10-09):** "go with your recommendation, don't ask me". Grilling tickets on
  this map are resolved by Claude on its recommendation, written down with the reason in the ticket's Answer, and the
  Owner is told the outcome rather than asked. A question only the Owner can answer (a fact about the farm, not a design
  choice) is still put to them.
- **Settled while charting** (not re-litigated):
  - Readers: the Farm's month is for the Owner and the accountant; the Venture's month is for the Owner alone. Investors
    keep receiving their own **অগ্রগতি**; this map makes no new Investor paper.
  - Month: a calendar month on the farm's clock, picked from a month selector; never a month to come; the current month
    prints as "so far, to {today}".
  - Format: a paper printed through the browser (Save as PDF), as every paper in OpenFarm prints (`printAlone`,
    `PaperDocument`); a CSV download of the Farm's month for the accountant. No server-made PDF.
- **What exists** (survey 2026-10-09): `monthlyReport.get` / `monthByMonth` (`packages/api/src/month-store.ts`) works
  every figure a month at a time — money, dairy, fattening, overheads — for the Farm's own animals, but the screen shows
  twelve months side by side with no single-month view, no print, no download; its Ventures part is per run, not per
  month. The Money page's Accountant tab already prints a summary and a CSV for any dates. Nothing on a Venture is
  counted per month: the Venture page and the অগ্রগতি are whole-run, "as of today".
- **Vocabulary**: [`CONTEXT.md`](../../CONTEXT.md) — **Export**, **Investor Statement**, **অগ্রগতি**, **Venture Plan**,
  **Holding**, **Venture Movement**, **Financial Year**. Grep before naming a paper; `/domain-modeling` records new terms.
- **ADRs that bind**: 0010 (no Projection on a paper), 0011 (Venture Plan the Owner's alone), 0012 (a return as a share,
  never a rate a year), 0016/0017 (Financial Years), 0021 (a paper reads in Bangla or English, what is on screen prints).
- **Skills**: `/grilling` + `/domain-modeling` for grilling tickets (answered per the delegation above); research tickets
  by a background agent writing to `assets/`.
- Assets go in `assets/` and are linked from the ticket.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- [How a Venture's month can be counted](./issues/02-how-a-ventures-month-can-be-counted.md) — costs cut by month
  exactly through the Settlement's own `chargesOfOwner`/`costsOf`; account balance by `balanceAtMonthEnd`; heads and
  weights need a new as-of read; profit, Margin, Overheads and Return on Cost cannot be cut by month; run-to-date worked
  over the stretch, never summed from months. Findings in `assets/venture-month-data.md`.
- [What the Farm's month paper holds](./issues/01-what-the-farms-month-paper-holds.md) — the **Monthly Report** for one
  month at `/monthly-report/$month`: money (by Category and Side), dairy, fattening, overheads and what it leaves out,
  beside the month before; no Venture part; a letterhead `PaperDocument` in Bangla or English plus a one-row-a-figure CSV,
  both Exports refused without the Registration number; the Owner's alone.
- [What a Venture's month paper holds](./issues/03-what-a-ventures-month-paper-holds.md) — its **Monthly Report** at
  `/ventures/$ventureId/months/$month`, the month beside the run to its end: animals (a new as-of head and weight read),
  charges by the Settlement's lines, the account with its Bank Check, the Reimbursement, each animal sold less her cost,
  plan to date and Monthly Sums; no profit, Margin, Overheads or Projection; paper and CSV as the Farm's.
- [The spec and its build tickets](./issues/04-the-spec-and-its-build-tickets.md) — [`spec.md`](./spec.md) and build
  tickets 05–11: the Farm's month page, paper and CSV first; a Venture's as-of herd read, then its month page, paper and
  CSV.

## Not yet specified

Nothing: the way is clear. Build from [`spec.md`](./spec.md), tickets 05–11.

## Out of scope

- A monthly paper for Investors: they receive the **অগ্রগতি**, an **Investor Statement** with its own rules.
- A server-made PDF, emailing or sending a paper automatically.
- Offering a month's paper when the month closes, in the Digest or on the home panels: both pages are reached from the
  screens the Owner already uses ([04](./issues/04-the-spec-and-its-build-tickets.md)).
- Periods other than a calendar month (a quarter, a Financial Year, any dates): the Money page's Accountant tab already
  prints any dates.
