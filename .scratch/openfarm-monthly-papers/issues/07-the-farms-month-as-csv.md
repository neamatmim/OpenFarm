# 07 — The Farm's month as a CSV

**What to build:** Download CSV on the month's page: one row a figure — `part`, `line`, `this month`, `month before`, `note` — plain
numbers in the reader's language, named by `stampedFileName`, recorded as an **Export** (`monthly_report`, `csv`).

**Blocked by:** 05

**Status:** done

- [ ] `monthlyReport.monthCsv({ month })` with `toCsv` and `stampedFileName`; the Export recorded; refused without the
      Registration number.
- [ ] The button saves it through `lib/save-csv.ts`.
- [ ] Tests: the rows match the page's figures; the "left out" row; the file name stamped; the Export written.

**Amended 2026-10-09 (ticket 07):** the CSV follows the accountant's own file instead of the reader's language — Bangla
bare and English beside it (`part`, `part_en`, `line`, `line_en`), no English where a Category was given none; a `way`
column (`in`/`out`) for the month's money by Category and by Side; `this_month` and `month_before` as numbers; no `note`
column. What the month leaves out has rows of its own, and the money awaiting approval a part of its own, as it is counted
in.
