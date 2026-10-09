# Management figures on the Monthly Report — spec

Asked 2026-10-09 (pasted list): cash flow summary, receivable aging, month-on-month comparison, margin percentages,
ROI, capital employed — "to make the report more useful for management decisions … profitability, cash position,
working-capital risk, and the performance of each business segment over time". The Owner said "go with your
recommendation": every choice below is Claude's, recorded here and in ADR 0023.

## Problem

The Monthly Report says what moved and what each Side was charged, but not what each Side came to after the costs of
running the place, how much cash the Farm holds of its own, who owes how long, what the store is worth, or how much
money each Side ties up and what it earns on it.

## Decisions

- **Readers: the Owner alone**, as the Monthly Report is (screen, paper, CSV). Nothing reaches an Investor.
- **Segments are the Sides** (Dairy, Fattening), and the Farm Capital in Ventures beside them.
- **No "profit".** A Side's month is its **Side Result** (CONTEXT.md): before and after its share of the Overheads. The
  app keeps cash books; the accountant keeps the full books. Every figure says what it is made of.
  - Dairy: milk sold (net of what stays written off, as today) less the month's dairy charges.
  - Fattening: the Margins of the Farm's own fattening animals sold in the month; brought in is their sale prices.
  - Overheads share: the month's Overhead a head a day × the head-days the Farm's own animals stood on that Side. The
    rest — the Ventures' animals' head-days — is the Farm's to bear and shown as its own line, so the shares add up to
    the Overheads.
  - The Farm's Result after Overheads = both Sides' Results before, less the whole of the Overheads.
  - Margin % = a Result over what that Side brought in, to one decimal; the dash where nothing came in.
- **Capital Employed is at cost** (CONTEXT.md), at the month's end, the Farm's own, cash not among it:
  - Fattening: each standing animal's price (or taken-on price) and every charge to her before the moment.
  - Dairy: each standing animal's entry price (nothing for one bred here) and her charges until she first calved —
    or all of them, not yet calved. Her keep after first calving is the milk's cost, not capital. An unpriced animal
    counts at nothing and is said.
  - Farm Capital in Ventures: capital out less capital back, for Ventures neither settled nor called off.
  - The store and the Receivables, at their own figures below.
  - Not today's price: Returns already sets each Season and the herd at it, and the capital's note points there
    (decided while building 06: the price machinery is Returns', and a past month has no past price).
  - **Return a month**: a Side's Result after Overheads over the mean of its capital at the month's start and end, per
    100 taka. The Ventures': "at Settlement", never a month's. The Farm's: over every capital but the Ventures'.
- **Cash Position** (CONTEXT.md) at a moment: the Farm's own notes in every hand (all notes less a Venture's sale cash
  not yet deposited and its Buying Floats), plus each Farm Account's worked-out balance; accounts not yet first read
  are counted and named, not guessed. The Ventures' money in a hand is shown apart as not the Farm's to spend.
  - **Cash flow**: opening (the moment the month began), money in, money out (the Farm's purse, as the accountant
    adds it), **the difference** — what moved without passing a hand or an account the farm names: count differences,
    money booked to nobody, an account read for the first time — and closing. Shown, never hidden, so the four add up.
- **Receivables by age** at the month's end (to today while it runs): owing by days since the Sale or Dispatch left —
  0–7, 8–15, 16–30, 31–60, over 60 — the total, and how much of it is overdue (`overdueFrom`).
- **Store** at the month's end: feed at its average price (`stockLedger`), medicine at its dose price (`bookAt`).
- **Month on month**: a Summary at the top — Brought in, Result before Overheads, Overheads, Result after Overheads,
  Margin after, Receivables, Store, the Farm's own cash — this month, the month before, and the change.
- **Return on Cost** stays a Season's, a Venture's and a dairy Animal's, never a month's: the year page
  (`/monthly-report`) shows each as it stands today, linking to Returns. Not on the month paper.

## Build tickets

01 words and ADR · 02 Side Results · 03 Receivables by age · 04 store · 05 cash position · 06 capital employed ·
07 Summary · 08 returns on the year page. Each adds its part to the month page, its paper and its CSV, test-first,
domain sums pure and tested in `packages/domain`, reading in `month-store.ts`.

## Done (branch report/management-figures, 2026-10-09)

01 8ee768d1 · 02 421a898b · 03 8dd83c3b · 04 af687121 · 05 a5b9e313 · 06 4e34e095 · 07 f3d3f031 · 08 741e7358 ·
minus sign 4d2a5ade · review fixes (below).

Review (standards + spec, two sub-agents) acted on:
- A cow in milk or dry with no calving written here (opening register, bought in milk) calved before her books: none of
  her keep is capital (`capital-calved-before.test.ts` went red first). One registered dry who calves here later still
  counts her dry weeks — nothing kept says she had calved.
- Unpriced animals counted on both Sides (`unpriced`), not only the dairy.
- The Summary's margin has its change, in points; one rule (`changeBetween`) for the paper and the screen.
- The year page no longer reads the month's ends it never shows (14 position reads per load); only a month's own page
  carries `atEnd`, `cashFlow` and `monthsReturn`, so no year-long "return a month" sits in the API.
- Tidy-ups: the results table's share column keyed, not matched by its English label; "ventures'" in sentence case;
  `KeptFigures` as an interface (the JSX-text scanner read the intersection as text); store value as two sums.

Dismissed: "a sold animal with no Margin" — `marginOf` is null only with no sale, so every sold animal has one.
Left: the Summary also carries each Side after overheads (harmless, and it is the segments over time); `bookAt(…, "")`
is that function's own way to say "no count put right".

## Test seams

1. Pure sums in `@OpenFarm/domain` (vitest unit tests beside each module).
2. `monthlyReport.month` through the router client against the test database (`packages/api`), as the month's tests do.
3. `monthlyReportPaper` / `monthlyReportRows` for the paper and the CSV.
