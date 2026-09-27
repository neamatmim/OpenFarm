# OpenFarm: what the money in cattle returns — map

Label: wayfinder:map

Tracker: local-markdown (`.scratch/openfarm-roi/`)

Charted: 2026-09-27

## Destination

A **ready-for-agent spec**, like [Joining a Venture](../openfarm-joining-a-venture/spec.md), under which the Owner reads what the money in the farm's cattle **returns**: each **Season** of the Farm's own fattening cattle, each **Venture**, and the dairy herd, once sold and while still standing, as a share of the money put in and as a rate per year, set beside a bank rate the Owner types in. Investors then read the return on their settled Ventures, and the **Projection** as a rate once the advisers allow it. The map is done when nothing about return is left to decide before the spec is written.

## Notes

- **What exists today** (from the code, 2026-09-27):
  - **Margin** (`marginOf` in `packages/domain/src/costs.ts`, per animal in `economicsOfAnimal` in `packages/api/src/cost-store.ts`) is a sold fattening Animal's sale price less her purchase price and everything charged to her. It is the Animal's own sum, whoever owns her. The glossary lists _profit_ and _return_ as words to avoid for it.
    - **An animal that died has no Margin.** Nothing adds up what she cost, so any sum of Margins leaves her out.
    - **A calf bred on the farm was "bought for nothing"**, so her purchase price counts as 0.
    - **Wages, sheds, utilities, repairs and equipment are never charged to an animal**, as the **Herd Cost** entry says. A Margin carries none of them.
  - **Settlement** (`settlement-store.ts`) gives a Venture's proceeds, its charges, the Owner's **Advance** back, capital back and the profit split by the frozen percentages. The Farm's part of the split pays it for its work, not for capital.
  - **Projection** (`packages/domain/src/projection.ts`, ADR 0010, ADR 0011) is a Venture's likely Settlement as a low–high range in taka. It is shown to Investors only behind `farm.investorProjections`, which stays off until the advisers see the wording.
  - **Month by month** (`/months`, `month-store.ts`) gives the Farm's money in and out and the Margins of its own fattening animals sold, per month and for the year. It also shows each Venture against its plan, or what it made once settled. It narrows to the Farm's purse and to the animals it owned that day (see `theFarmsOwn`).
  - **Animal prices** (`animal-price-store.ts`, `packages/domain/src/animal-price.ts`) value a standing animal at her latest weight × a price a kilo: the farm's market price for its own, the Venture Plan's prices for a Venture's. **Cost of Gain now** and the keep-or-sell verdict are built on them.
  - **Cost per Litre** and the **Cull Reason** list read a dairy cow's keep against her milk.
  - **Nothing measures money earned against the money put in and the time it was tied up.** No figure is a percentage or a rate a year.
  - **No record of land, sheds or equipment as capital.** Equipment is an expense Category.
- **Settled while charting (2026-09-27)**, not to be re-asked:
  - **Whose return**: the money in cattle. Fattening came first: the Farm's own runs and each Venture. The Owner then brought in the dairy herd's return too.
  - **What for**: judging runs after the fact, side by side. The Owner also ticked in cattle still standing, a bank rate beside the figure, and the Projection as a rate.
  - **Who reads it**: the Owner, then Investors. The Manager does not (see Out of scope).
  - **The destination is a spec only.** The build is handed off when the map closes.
- **Domain vocabulary** is in [`CONTEXT.md`](../../CONTEXT.md). Grep it before naming anything. **Season**, **Return on Cost**, **Return on Capital**, **Bank Rate**, **Margin**, **Settlement**, **Projection**, **Venture Plan**, **Cost of Gain**, **Cost per Litre**, **Herd Cost**, **Purse**, **Advance**, **Internal Sale**, **Target Window** and **Investor Statement** are the entries this touches. _Return_ stays on Margin's avoid list; the ratios are **Return on Cost** and **Return on Capital**, never ROI or মুনাফার হার.
- **Existing research** that bears on this: [`cattle-investment-schemes.md`](../../docs/research/cattle-investment-schemes.md) (how Bangladeshi and foreign cattle schemes state ROI, and which collapsed) and [`bangladesh-pooled-investment.md`](../../docs/research/bangladesh-pooled-investment.md) (no promise of principal or a fixed return, anywhere).
- **Skills**:
  - `/grilling` + `/domain-modeling` for grilling tickets.
  - A background research agent for research tickets.
  - `/prototype` when a prototype ticket graduates from the fog.
- **Research** findings are written at `docs/research/<name>.md` on a `research/<name>` branch, then merged to main. The ticket links them.
- **Assets** go in `assets/` and are linked from the ticket, never pasted into it.
- **Standing constraints**:
  - An animal's money is the Owner's alone. Nothing here reaches the Manager.
  - A Farm figure narrows both the money (the Farm's **Purse**) and the animals (whose each one was that day), or a Venture's bull is counted twice.
  - No **Investor Statement** ever prints a projection, and every Investor-facing word keeps "no return is guaranteed, a loss comes off capital".
  - Nothing may read as a promised or fixed return (see the pooled-investment research). `farm.investorProjections` stays off until the Owner says the advisers have seen the wording.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- [How a cattle return is measured](./issues/01-how-a-cattle-return-is-measured.md) — Bangladeshi studies give net return, gross margin and BCR per head per batch, never a rate a year. The comparable figure is net return ÷ total cost. A dead animal stays in the run, and a home-bred calf enters at market. A Margin charges no wages, sheds or interest, so it reads higher than a study's. GIPS forbids annualising under a year. [Research](../../docs/research/measuring-a-cattle-return.md).
- [How a mudarabah return is stated to investors](./issues/02-how-a-mudarabah-return-is-stated.md) — Islamic banks state a yearly rate, provisional then final; Shariah allows a past or expected return to be stated but never fixed as a share of capital. A settled return as a share of capital is a fact. A rate a year on a short run is a simulated figure and reads like a bank account, and the Projection should never be one. Every collapsed scheme promised a fixed figure before any result. [Research](../../docs/research/stating-a-mudarabah-return.md).
- [What a run of the Farm's own cattle is](./issues/03-what-a-run-of-the-farms-own-cattle-is.md) — a **Season**: the Farm's own fattening cattle aimed at one Target Window, one per Eid, a non-Eid window alone. An animal stays in it however she goes, and it is finished when the last has gone. Crossing from Dairy and buying from a Venture join one and ask for a Target Window; selling to a Venture leaves at its price. Venture animals are in none.
- [What a return counts](./issues/04-what-a-return-counts.md) — a Season is worked as a Settlement is, deaths in. **Return on Cost** (খরচে লাভ) is result ÷ total cost, for a Season and a Venture's cattle alike. **Return on Capital** (মূলধনে লাভ) is the Investors' share ÷ all their capital, after the Farm's share, which has no ratio. The Owner prices a crossed calf, and that price is the dairy herd's return too. The Advance is in neither. One sentence says wages, sheds, dung and the money's cost are left out.
- [How a return is put per year](./issues/05-how-a-return-is-put-per-year.md) — simple, never compounded, over money × days: for Return on Cost, each taka from when spent to when its animal sold; for Return on Capital, from arrival to payout, idle days in. No rate under 60 days of average holding (Owner's Farm Parameter). A loss is scaled the same. Shown after the share and days, labelled, with its working.
- [What cattle still standing return](./issues/06-what-cattle-still-standing-return.md) — a standing animal counts at today's weight × the price a kilo, as a low–high range, labelled «আজকের দামে», «অনুমান, ফল নয়», with sold and standing apart. No rate a year and no Return on Capital until finished. The Projection stays the look forward. An animal who can't be valued is left out whole and named.
- [The bank rate beside it](./issues/07-the-bank-rate-beside-it.md) — a **Bank Rate**: one rate a year the Owner types with a note, before tax, dated, read as locked on the day a Season's or Venture's first taka went in. It sits as a plain line beside every finished rate a year, and is the Owner's alone, never an Investor's.

## Not yet specified

- **Where the Owner reads it.** A page of its own, Month by month, the Venture page or the Fattening board. Probably a prototype, once what a return counts, how it is put per year, and the standing and dairy figures are settled.
- **Whether a Season breaks down further** by haat, trader, breed or weight band, to judge the buying inside it.

## Out of scope

- **The whole farm's return** on land, sheds, cows and equipment. OpenFarm keeps no record of these as capital, so it would need a register of what the farm owns first. That is its own effort. Decided while charting.
- **Using the return to set a Venture's terms** (choosing the split so Investors' return is competitive). Decided while charting.
- **The Manager reading returns.** Money stays the Owner's alone. Decided while charting.
