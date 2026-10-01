# 01 — Monthly terms on a Venture

**What to build:** When the Owner opens a Venture she chooses how it is paid: all before buying (as every Venture so
far), or the cattle part first and the rest by the month. For the second, the Venture carries the monthly sum per Unit,
how many months, and the day of the month it is due — worked from its own budgets, so the Unit price still adds up.

**Blocked by:** the Owner's open points (README), the advisers' written answers.

**Status:** not started

- [ ] **Glossary:** a word for the Venture's way of being paid and for one monthly sum (check CONTEXT.md first; not
      "instalment", which Baki Payment avoids). The Unit entry: "paid all before buying, or its cattle part first and
      the rest by the month".
- [ ] **Schema:** on `venture` — how it is paid (default all before buying for every existing row), months, due day.
      The monthly sum per Unit is worked, never typed: (Unit price − cattle part) ÷ months, whole taka, the last month
      taking the remainder. Cattle part per Unit = Cattle Budget ÷ Units.
- [ ] **Opening and the plan sheet:** the choice, the months and the due day; the sheet shows "৳40,000 before buying,
      then ৳2,000 a month for 5 months" per Unit. Refused: months under 1; a cattle part that is not whole taka.
- [ ] **Offer and portal:** an invited Investor reading an offer sees the same line before he asks to join.
- [ ] **Tests:** the worked sums add up to the Unit price for awkward figures; existing Ventures read as all before
      buying.
