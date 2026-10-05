# The farm's own capital in a Venture

The Owner asked (2026-10-02) how the farm — the business, not the Owner personally — could take part in a Venture as
an investor. It cannot today, and should not outside the app either:

- Every Venture is a **mudarabah** the lawyer and the Shariah scholar approved on 2026-09-26: the Investors bring all
  the capital, the farm its work. The farm bringing capital makes it a partner for that money (AAOIFI SS 13 §8/9) — it
  then shares loss on it — which the approved wording does not cover. The research listed "whether the Owner invests
  alongside" as an open question (`docs/research/bangladesh-pooled-investment.md` §5,
  `cattle-investment-schemes.md` §8.2); nothing records an answer.
- The app has no way to hold the farm's money as capital: the farm's books would not show it leaving, the Settlement
  would pay it back as a private Investor's, and Returns and Months would not count it as the farm's.

Not the same as the Owner investing personally (an ordinary Investor with an Agreement, which works today), nor as an
**Advance** (the Owner's interest-free money for running costs, repaid before capital, sharing in nothing).

## Status

- [x] Question sheet for the advisers: `advisers-sheet.html` (print, A4; Bangla first). Ten questions — Shariah
      (permissible?, profit, loss, limits), lawyer (how documented when the farm cannot sign with itself, telling the
      other Investors, new or running Ventures, Companies Act s.4), accountant (booking, tax).
- [ ] The Owner hands it over and brings back the written answers.
- [ ] Turn the answers into a build plan with tickets here. Expected shape, depending on the answers: "Farm's Units" on
      a Venture (no stamped Agreement), the money out of the farm's purse into the Venture Account and back at
      Settlement, the split and every Investor paper counting them with the approved disclosure, the farm's Returns
      and Months showing it as the farm's own investment.

~~Do not build any of it before the answers.~~ The Owner, 2026-10-05: "Don't wait for advisor, implement as your
recommendation". Built on the answers below, which are Claude's recommendation, not the advisers'.

## Decided 2026-10-05 (Claude's recommendation, at the Owner's word, ahead of the advisers)

1. **Permissible, under the current mudarabah with an added clause.** AAOIFI SS 13 §8/9: a mudarib that mixes in
   its own money is a partner for that money and mudarib for the rest.
2. **Profit:** the Farm's Units earn the Investors' share like anyone's, and the Farm takes its mudarib share of the
   whole profit as today.
3. **Loss:** the Farm's capital bears loss in proportion to its Units, exactly as an Investor's.
4. **Limits:** same Unit price and terms as everyone; **at most half** of a Venture's Units, so a Venture stays its
   Investors'.
5. **Documented:** no Agreement with itself — the Farm's Units are a record the Owner writes on the Venture (an
   Agreement of its own kind, `farm_own`, with no stamp), and a **declaration clause** in every Investor's Agreement
   that names them.
6. **Told:** in the Agreement before they sign, on the যোগদানপত্র and অগ্রগতি, and in the portal beside the Venture's
   terms.
7. **New Ventures only, in effect:** the Farm takes its Units only while a Venture is open and **before any Investor has
   signed**, so every Investor signs knowing. No Amendment route.
8. **Companies Act s.4:** the Farm is the Owner's own business; the Owner is already one of the twenty, so the Farm's
   Units add no one to the Investor Cap.
9. **Books:** the capital leaves the Farm's books as money out ("The Farm's capital into a Venture"), comes back at
   Settlement or on a call-off as money in ("The Farm's capital back from a Venture"), and its share of the profit
   as income ("The Farm's return on its own capital"); a loss shows as capital back short. No tax point is taken.
10. **Caution:** the Farm's own Units get no papers, no Nominee, no portal and no Pay-in Notes — it is not a person.

## Tickets

| #   | Ticket                                   | Status |
| --- | ---------------------------------------- | ------ |
| 01  | The Farm's Units on a Venture            | Done   |
| 02  | Its money, out and back                  | Done   |
| 03  | Told to the Investors                    | Done   |

All three built 2026-10-05 on branch `feat/farm-capital` (ADR 0019). The advisers' sheet still stands: when they answer,
the clause wording, the half-share limit and the booking follow them.
