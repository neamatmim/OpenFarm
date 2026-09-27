# 01 — Monthly Costs: what is not entered

**What to build:** The Owner ticks a Category as paid every month, and from the farm's due day the Manager and the Owner see each Monthly Cost with nothing entered this month, each still empty last month, and each person paid a wage one month and not the next.

**Blocked by:** —

**Status:** open

- [ ] **Shed rent** is a standard Category: key `rent`, «শেড ভাড়া» / "Shed rent", out, in `NEVER_THE_ANIMALS`, retirable.
- [ ] **`money_category.paid_monthly_since`** (timestamp, null). Migration applied to both dev databases; LATEST_MIGRATION moved.
- [ ] **`money.setPaidMonthly({ categoryId, paidMonthly })`**: Owner only, personal session, audited. Refused for money coming in, a Category a record books, Wages (watched by the person), and a retired Category. Taking the mark off clears the date; putting it back starts again from that day.
- [ ] **`farm.monthly_costs_due_day`**: default 10, 1–28, Owner only, on the Parameters page with the money settings.
- [ ] **Domain `monthlyCostsNotEntered`**: pure. Named for this month once today reaches the due day; last month always, while it is not before the mark's month. A retired Category is never named. Wages: people paid for month W−1 and not W, once W is over and W+1 has reached the due day, named for W only. Tests cover the edges: the due day itself, a January reaching back into December, a mark put on mid-month, an entry awaiting approval counting as entered, a Venture's money not counting, and someone who leaves being named once.
- [ ] **Home:** `home.manager` queue and `home.owner` needsYou gain `monthlyCosts`. Rows say what and which month. Tapping one opens the money entry pre-filled.
- [ ] **Categories tab:** the Owner's "paid every month" tick and a badge.
- [ ] **Seed:** rent and utilities are marked, with one month of rent left missing so the list shows something.
- [ ] **Prove the guards by switching them off:** the Manager refusal, and the due-day filter.
- [ ] **Somebody opens it:** the Manager's home, the Owner's home, the Categories tab, the Parameters page, in both languages.
