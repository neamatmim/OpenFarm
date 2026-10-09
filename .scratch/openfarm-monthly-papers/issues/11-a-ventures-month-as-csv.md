# 11 — A Venture's month as a CSV

**What to build:** Download CSV on the Venture's month page: one row a figure — `part`, `line`, `this month`, `to the month's end`, `note` —
as the Farm's (07), recorded as an **Export** naming the Venture.

**Blocked by:** 09, 07

**Status:** done

- [ ] `ventures.monthCsv({ ventureId, month })` with `toCsv` and `stampedFileName`; the Export recorded.
- [ ] The button saves it.
- [ ] Tests: the rows match the page; the file name; the Export written.

**Amended 2026-10-09 (ticket 11):** as the Farm's CSV was amended (07), the columns follow the accountant's own file —
`venture`, `part`, `part_en`, `line`, `line_en`, `way`, `this_month`, `to_month_end`, `note` — figures as numbers. Each
row names the **Venture**, as a Bangla name does not survive `stampedFileName`; the file is `venture-monthly-report`.
`note` keeps what a figure cannot carry: a sale's day, the Bank Check's standing (`matched`, `differs`, `stale`,
`not_checked`), the tags not weighed. The animals, the account, the Reimbursement and each sale fill `this_month`; the
plan and the Monthly Sums `to_month_end`; the charges both. The farm's expected figure is written only where the paper
says it, beside a statement that differs. A part with nothing has no rows, but the animals and charges always have lines.
