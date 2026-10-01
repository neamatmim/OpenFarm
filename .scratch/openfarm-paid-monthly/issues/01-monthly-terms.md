# 01 — Monthly terms on a Venture

**What to build:** When the Owner opens a Venture she chooses how it is paid: all before buying (as every Venture so
far), or the cattle part first and the rest by the month. For the second, the Venture works out the monthly sum per
Unit and how many there are from its own budgets and dates, so the Unit price still adds up and an Investor knows the
whole schedule before he signs.

**Blocked by:** — (answered 2026-10-02, see answers.md)

**Status:** done (2026-10-02)

- [x] **Glossary:** a word for the Venture's way of being paid and for one monthly sum (check CONTEXT.md first; not
      "instalment", which Baki Payment avoids). The Unit entry: "paid all before buying, or its cattle part first and
      the rest by the month".
- [x] **Schema:** on `venture` — how it is paid (default all before buying for every existing row). Nothing else is
      stored: the due day is the 10th for every Venture (answers.md), and the sums are worked, never typed —
      months = the 10ths after the month of `decideBy` and before `targetWindowStart`; cattle part per Unit = Cattle
      Budget ÷ Units; monthly sum = (Unit price − cattle part) ÷ months, whole taka, the last month taking the remainder.
- [x] **Opening and the plan sheet:** the choice; the sheet shows "৳40,000 before buying,
      then ৳2,000 on the 10th of each month, June to October" per Unit. Refused: no 10th between the decision date and
      the Target Window; a cattle part that is not whole taka.
- [x] **Offer and portal:** an invited Investor reading an offer sees the same line before he asks to join.
- [x] **Tests:** the worked sums add up to the Unit price for awkward figures; existing Ventures read as all before
      buying.

**As built:** the schedule is frozen on the Venture when it opens (`capital_paid`, `cattle_part_bdt`, `monthly_sums`,
`first_sum_due_on`) rather than worked again on every read, because a window an Amendment moves must move no
Investor's schedule. The Cattle Part is the Unit price in the Cattle Budget's proportion of the capital (Units × price
need not equal the capital). Words: **Cattle Part**, **Monthly Sum** in CONTEXT.md. `PaidForBy` says it on the opening
sheet (live), the Venture page and the portal offer. Opened on the seed farm in both languages; the portal offer page
was not opened in a browser (needs an Investor sign-in) — its answer is pinned by portal-open-ventures.test.ts.
