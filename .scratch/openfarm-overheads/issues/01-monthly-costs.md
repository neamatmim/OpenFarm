# 01 — Monthly Costs: what is not entered

**What to build:** The Owner ticks a Category as paid every month, and from the farm's day of the month the Manager and the Owner see each Monthly Cost with nothing entered this month, each still empty last month, and each person paid a wage one month and not the next.

**Blocked by:** —

**Status:** done

- [ ] **Shed rent** is a standard Category: key `rent`, «শেড ভাড়া» / "Shed rent", out, in `NEVER_THE_ANIMALS`, retirable.
- [ ] **`money_category.paid_monthly_since`** (timestamp, null). Migration applied to both dev databases; LATEST_MIGRATION moved.
- [ ] **`money.setPaidMonthly({ categoryId, paidMonthly })`**: Owner only, personal session, audited. Refused for money coming in, a Category a record books, Wages (watched by the person), and a retired Category. Taking the mark off clears the date; putting it back starts again from that day.
- [ ] **`farm.monthly_costs_from_day`**: default 10, 1–28, Owner only, on the Parameters page with the money settings.
- [ ] **Domain `monthlyCostsNotEntered`**: pure. Named for this month once today reaches the farm's day; last month always, while it is not before the mark's month. A retired Category is never named. Wages: people paid for month W−1 and not W, once W is over and W+1 has reached the farm's day, named for W only. Tests cover the edges: that day itself, a January reaching back into December, a mark put on mid-month, an entry awaiting approval counting as entered, a Venture's money not counting, and someone who leaves being named once.
- [ ] **Home:** `home.manager` queue and `home.owner` needsYou gain `monthlyCosts`. Rows say what and which month. Tapping one opens the money entry pre-filled.
- [ ] **Categories tab:** the Owner's "paid every month" tick and a badge.
- [ ] **Seed:** rent and utilities are marked, with one month of rent left missing so the list shows something.
- [ ] **Prove the guards by switching them off:** the Manager refusal, and the day-of-the-month filter.
- [ ] **Somebody opens it:** the Manager's home, the Owner's home, the Categories tab, the Parameters page, in both languages.

**Review (2026-09-28):** the setting was renamed `monthly_costs_from_day` (migration 20260928001500), because the glossary avoids "due" for a Monthly Cost. It sits in its own Owner-only group on the Parameters page, not with the money settings the Manager also sets. Vet fees may not be marked, since a record books them. Wage rows carry the person's record. The Owner's "waiting on you" count leaves these rows out; they are the Manager's to enter.
