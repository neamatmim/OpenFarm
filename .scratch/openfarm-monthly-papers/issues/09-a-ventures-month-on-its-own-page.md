# 09 — A Venture's month on its own page

**What to build:** A Venture's **Monthly Report** at `/ventures/$ventureId/months/$month`: the month beside the run to its end — animals
(08), charges by the Settlement's lines, the Venture Account with its Bank Check, the Reimbursement, each animal sold less
her cost, the Venture Plan to date and Monthly Sums — with a selector of the months it ran. Reached from the Venture page
and the Farm's month page.

**Blocked by:** 08

**Status:** done

- [ ] `ventures.month({ ventureId, month })`: each part per the spec; run-to-date worked over the stretch and rounded once.
- [ ] Months selectable: opened to settled or called off; a month to come refused; Owner only.
- [ ] The page, its parts in order, "nothing this month" where empty, the closing "left out" line.
- [ ] «মাসিক প্রতিবেদন» on the Venture page opens its latest month; the Farm's month page links here.
- [ ] Tests: hand-worked figures for a seeded month; a settled run's months summed match the Settlement within paisa and
      its run-to-date column to the paisa; a Venture still gathering shows money only; the Manager refused.
- [ ] Opened in the browser in both languages.
