---
status: accepted
date: 2026-10-05
---

# The Owner records a change of the financial year

ADR 0016 gave the farm one financial year, set with its server: twelve months from `OPENFARM_YEAR_STARTS`, July in Bangladesh. The next day the Owner asked what happens if the government changes the year, and the research (`docs/research/financial-year-changes.md`) found that it already has. On 17 August 2026 the Cabinet decided to move Bangladesh's fiscal year to April–March, with 2027–28 a nine-month transition year from July 2027 to March 2028. The law is not amended yet, and the NBR has not said what the income year does. Elsewhere, transition years have run 3, 6, 9 and 18 months, countries have changed twice and changed back, and the rule has sometimes been fixed weeks before, or after, the odd year began.

One month cannot describe that. Changing `OPENFARM_YEAR_STARTS` would re-cut every year the farm has already closed, and it cannot express a year of nine or eighteen months.

**A Year Change is a record the Owner keeps.** It names the year that changes, by the month it begins, and the month the first year of the new rule begins. The year between them is the **Transition Year**, as short or as long as the two months make it. A reason is required, because an accountant must say why a year is not twelve months (IAS 1 paragraph 36). It is kept in `financial_year_change`. It is never edited or removed: a change put right is withdrawn, with why, and recorded again. Each is an Audit Event. The Owner records them from Farm settings, Financial year (`/farm/financial-year`); Managers read them there.

**The years are worked out on read, never stored.** `OPENFARM_YEAR_STARTS` still gives the month the years began in before any change. The changes in force, in order, give the rest (`packages/domain/src/financial-year.ts`). Every screen asks the server for its years: the Monthly report's picker, the money page's two shortcuts, and the settings page. The browser no longer reads the year from the page's root.

**A year that has ended keeps its length.** A change must begin with this year or a later one, and its Transition Year must not have ended. Only the latest change may be withdrawn, and only while the years it changed have not ended. So a change recorded on the day the law passes, or after the transition year has begun (as Myanmar fixed its 2019 income year), is taken; a change that would move a year the accountant already holds is refused.

**A year is named by its first month.** The address and the procedures say `2027-07`, not `2027`. In Myanmar in 2018, two years began in the same calendar year. Screens name a year as the accountant writes it, 2027–28, and a year that is not twelve months says its length too: «২০২৭–২৮ (৯ মাস)». A Transition Year is shown as it was, at its own length, never scaled up to twelve months.

**Consequences:**

- The farm's year is the farm's books' year, not the national budget year. Bangladesh already runs three income years at once (banks and insurers on the calendar year), and the two may not move on the same day. The Owner records the change when the farm's accountant moves the books.
- A change cannot begin before the last one, so a change between two recorded ones means withdrawing the later one first.
- **Revisit** when the Constitution and the General Clauses Act are amended, or the NBR publishes the 2027–28 income year. If either differs from the Cabinet's nine months, the Owner withdraws the change and records the law's.
