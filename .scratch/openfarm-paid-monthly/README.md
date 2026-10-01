# Ventures paid by the month

The Owner, 2026-10-02: "we may take only the animal buying amount first and rest of the amount may pay per month based
on the share unit." That is the farm's real way of raising a Venture, and the app does not do it today:

- Capital is taken only while a Venture is **open** (`takeCapital` refuses after). Nothing can come in by the month.
- What arrives is divided between the **Cattle Budget** and the **Running Budget** in proportion (CONTEXT.md). Cattle
  money paid first would be half spent on feed that is not yet eaten, and the lorry would go short.
- Buying may start on the **Floor** alone, with an Agreement part paid.

## Decided by the Owner (2026-10-02)

1. **The monthly sum is fixed per Unit, set when the Venture opens.** Running Budget ÷ Units ÷ months, so an Investor
   knows before he signs what he pays and when. Not the month's actual cost.
2. **A missed month: he shares by the taka he actually paid.** The **Advance** feeds the animals meanwhile and is
   repaid first at Settlement, as it is today. — **Built**: the Settlement divides by Units held, capital paid over the
   Unit price to four places (56eecc8f, then f04b6a5f). Units held can be 9.6; the closing paper prints them so.
   The progress paper and the portal say Units held and the share of all held once buying starts (signed while open).
3. **Plan now, build after the advisers.** Every Agreement so far says the capital comes in whole before the buying;
   this changes what an Investor signs. Questions in `advisers-sheet.html`.

## Answered (2026-10-02)

The advisers answered all nine questions and the Owner decided the rest: see [`answers.md`](answers.md). In short —
allowed with clauses added; share by taka paid; the Advance covers a missed month; no late fee; due on the 10th, missed
after 7 days, may be paid late until selling; unpaid Units stay empty; stamp on the whole capital with the schedule in
the Agreement; a Nominee may pay the rest. Months are worked from the decision date to the Target Window.

## Shape

| Today                                           | Paid by the month                                                 |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| One Unit price, all before buying               | Unit = cattle part (before buying) + so many monthly sums         |
| Capital split across both budgets in proportion | Cattle part → Cattle Budget; monthly sums → Running Budget        |
| Buying starts on the Floor                      | Buying starts when every Agreement's cattle part is in, Floor too |
| No capital once buying starts                   | Monthly sums taken while running, never over what was signed for  |
| Share by Units signed                           | Share by Units held (built)                                       |

A Venture is one or the other, chosen when it opens; every Venture so far stays "all before buying".

## Tickets

| #   | Ticket                                                   | Blocked by                               |
| --- | -------------------------------------------------------- | ---------------------------------------- |
| 01  | [Monthly terms on a Venture](issues/01-monthly-terms.md) | —                                        |
| 02  | [The cattle part first](issues/02-cattle-part-first.md)  | 01                                       |
| 03  | [Monthly sums while it runs](issues/03-monthly-sums.md)  | 02                                       |
| 04  | [Who is behind](issues/04-who-is-behind.md)              | 03                                       |
| 05  | [The papers say it](issues/05-papers-say-it.md)          | 01; drafted clauses read by the advisers |

Answered: 01–04 may be built. 05's clauses are drafted here and read by the advisers before they are published.
