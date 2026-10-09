# 01 — What the Farm's month paper holds

Status: resolved

Type: grilling

Blocked by: —

## Question

What does the paper for one month of the Farm say, and how is it reached and kept?

- **Its parts**, from what `monthByMonth` already works for a month: money in and out (and the entries awaiting), dairy
  (milk sold, liters, price fetched, cost a liter, liters a cow), fattening (charged, sold, Margins), overheads (and per
  head a day), and the figures it leaves out (unpriced kg, uncosted doses) said as such. Whether it compares the month
  with the month before or the same month last year.
- **The Ventures part**: per run today. What the Farm's month says of Ventures, if anything (Farm Capital, Advances,
  Reimbursements in the month), or whether it points to each Venture's own month paper.
- **The CSV**: its rows and columns, so the accountant can lay it beside the Accountant tab's file; its file name.
- **Export or not**: it goes to the accountant, outside the system — an **Export** with its Audit Event, stamped, the
  CSV stamped in its name? Refused without the Registration number, as other papers are (`assertRegistered`)?
- **Who may print it**: the Owner alone, as the monthly report is, or the Manager too, as the Accountant tab is.
- **Language and look**: a `PaperDocument` on the Farm Identity letterhead read in Bangla or English (ADR 0021), or a
  text paper like the accountant summary.
- **Where it is reached**: a month on the monthly report opens it (a single-month view with Print and CSV), with a month
  selector.
- **Its name**, checked against CONTEXT.md.

## Answer

Resolved 2026-10-09 by Claude on its recommendation, as the Owner delegated (map Notes).

1. **Name.** The **Monthly Report** for one month: «মাসিক প্রতিবেদন — অক্টোবর ২০২৬» / "Monthly report — October 2026",
   the name the screen already has (`nav.months`). The current month reads «… (আজ পর্যন্ত)» / "(so far, to 9 October)".
   Added to CONTEXT.md.
2. **Its parts**, all from what `monthByMonth` already works for a month (`figuresOver`, `month-store.ts`), with one
   column for the month and one for **the month before** — two figures side by side, no percentage, so a change reads at a
   glance without inventing a trend. Not the same month last year: a young farm mostly has none.
   - **Money**: in, out, net; then by Category and by Side, as the accountant's summary adds them (`summarizeMoney`, for
     the month); the Money Events still awaiting the Owner counted in, and said in a line.
   - **Dairy**: milk sold and liters, what a liter fetched, charged to the dairy side, liters to Bulk, liters a cow milked
     a day, cost a liter.
   - **Fattening**: charged to the fattening side, animals sold, their Margins.
   - **Overheads**: the month's, and a head a day.
   - **Left out**: kg unpriced and doses uncosted, said in a closing line as figures the month leaves out, never as
     zero.
3. **Ventures.** No Venture part. A Venture's money is not the Farm's; what passes between them — Farm Capital,
   Advances, Reimbursements — is already in the Farm's money by Category. One line says each Venture keeps its own
   accounts and has its own month paper (03). The run-wide "Ventures against plan" stays on the screen only.
4. **The CSV**, for the accountant beside the Accountant tab's file: one row a figure — `part`, `line`, `this month`,
   `month before`, `note` — amounts as plain numbers (no ৳, no grouping), in the reader's language like the paper, and a
   `left out` row for unpriced kg and uncosted doses. Named by `stampedFileName(farm, "monthly-report", month, now)`, built
   with `toCsv`.
5. **An Export.** It goes to the accountant, so the paper and the CSV are each an **Export** with its Audit Event
   (`recordExport`, a new `monthly_report` report with the month as its period and the format), stamped on the paper's
   face and in the CSV's name, and refused without the Registration number (`assertRegistered`), as the accountant's
   export is.
6. **Who.** The Owner alone, as the monthly report and its Margins are (`OWNER_ONLY`). The Manager keeps the Accountant
   tab for money.
7. **Look and language.** A `PaperDocument` on the **Farm Identity** letterhead — facts and tables — read in Bangla or
   English with the paper's own switch (ADR 0021), printed with `PaperDialog`'s Print (Save as PDF). No Projection, no
   rate a year (ADR 0010, 0012).
8. **Where.** Each month on the monthly report (table row and phone card) opens `/monthly-report/$month`
   (`YYYY-MM`): the month's figures on screen, a month selector (the months the farm has kept, never one to come), and
   two acts — Print and Download CSV. The year view keeps its `?year=`.

**Why:** everything the paper says is already worked per month and trusted on the screen; the paper adds a single-month
view, a layout and an Export, not new arithmetic — so the Farm's month can ship first and alone.

**Amended 2026-10-09 (ticket 07):** the CSV follows the accountant's own file instead of the reader's language — Bangla
bare and English beside it (`part`, `part_en`, `line`, `line_en`), no English where a Category was given none; a `way`
column (`in`/`out`) for the month's money by Category and by Side; `this_month` and `month_before` as numbers; no `note`
column. What the month leaves out has rows of its own, and the money awaiting approval a part of its own, as it is counted
in.
