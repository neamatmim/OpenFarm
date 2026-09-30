# J — Buying and deaths

Survey "smaller or waiting" items (`../survey.md`), chosen by the Owner 2026-09-30.

**What the app already does** (read from the code, 2026-09-30):

- An Intake holds price, Hasil, weight, seller and trip (`schema/fattening.ts:54-95`); the intake sheet shows this
  animal's ৳/kg (`intake-sections.tsx:221-232`) with **nothing to compare it with**. The farm keeps a market price for
  selling only (`farm.marketLow/HighBdtPerKg`); recent ৳/kg exists for sales only (`perKgOfSales`).
- Mortality: one row per animal with a free-text cause (`schema/herd.ts:309-343`). Calves have five quick-pick causes
  and a loss report (`calf-losses.ts`); **adults have neither**, and no death rate exists anywhere.
- **The death form never links her Diagnosis** (checked: no web caller sends `diagnosisId`), so the mortality register
  printed for the Inspector (`registers/mortality.ts:35-43`) never shows the DLS Report of a death from a notifiable
  disease.
- **No report groups deaths or illness soon after arrival by seller or haat**; a seller is a Counterparty, the haat the
  Buying Trip's free-text `wentTo`. The feed "scale by seller" card is the pattern.

| #   | Ticket                          | Blocked by |
| --- | ------------------------------- | ---------- |
| 01  | Deaths by cause, and the rate   | —          |
| 02  | What the last buys cost         | —          |
| 03  | Early losses by seller          | 01         |

**Settled in drafting** (the Owner may overrule; nothing here was asked):

- Adult causes as quick-picks in Bangla (the Vet may be asked to check them), "another cause" free text kept; stored as
  text like the calf causes. The rate: deaths per 100 head a year, per Side, 12 months, from the animals' days on the
  farm; culls counted apart, never in the rate.
- The death form offers her Diagnoses of the last 60 days; the correction may set it.
- Buying: the farm's own buys of the last 60 days, price + Hasil ৳/kg, the same weight band; the Manager sees it (they
  buy, and know the prices already). No separate buying market price.
- "Early" is 30 days from arrival (the quarantine); deaths and Diagnoses both counted, culls apart; per seller and per
  haat as typed; shown to the Owner only, never on the death record.
