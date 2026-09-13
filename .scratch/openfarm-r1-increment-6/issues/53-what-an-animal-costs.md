# 53 — What an animal costs, and what a litre costs

**What to build:** The Owner wants to know which side of the farm makes money. Feed is charged to the animals that ate it — the Feed Item's weighted-average price times the kg fed to a Pen, split across the animals standing in it by animal-days — and medicine is charged to the animal treated, a dose at a time. From those come each fattening animal's margin and the dairy side's cost per litre, on the animal's page and in the period report.

**Blocked by:** 48, 51

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 6, user stories 76 and 81; [Feed and inventory](../../openfarm-release-1/issues/12-feed-and-inventory.md) (cost allocation); [Finance in Release 1](../../openfarm-release-1/issues/13-finance-in-release-1.md) (per-animal economics); `CONTEXT.md` — **Feeding**, **Money Event**.

- [x] A Pen's feed cost for a session is its Feedings' kg times each Feed Item's weighted-average price at the time, split evenly across the animals in the Pen by animal-days; home-grown fodder at no price costs nothing, and the report says so
- [x] A dose given costs the product's recent purchases' price divided by the doses they held (the Owner's decision, 2026-09-13), charged to the animal who had it; a dose of a product never bought is shown as uncosted rather than as free
- [x] A fattening animal's margin is her sale price minus her purchase price, allocated feed and allocated medicine; a dairy cow's cost per litre is her allocated feed and medicine divided by her litres to Bulk; both are derived, never stored
- [x] Both show on the animal's page to the Owner and Manager, and in a period report by Side; Barn Staff and the Vet see none of it
- [x] Tests cover a Pen's feed split across two animals over different days, a costed and an uncosted dose, a sold fattening animal's margin, and a cow's cost per litre

## What was built

**Pen history** (domain, `penHistoryOf`) comes from each Animal's moves: where she stood, on which Side, from each move until the next or until she left (her exit's `stateChangedAt`).

**Feed charged to animals** (`feedShares`):
- A Feeding costs each Feed Item's weighted-average price at the moment it was fed, times the kg given.
- The price comes from `priceHistory`: one replay of the store per item, looked up by time, matching `stockLedger(asOf)` and left unrounded until it is added up.
- The cost is split evenly across the animals standing in the Pen at that moment. Session by session, that is the split by animal-days.
- Feed at no price counts as unpriced kg, and every screen says how much.
- A Feeding with nobody standing in the Pen is unallocated, and reported for the period rather than spread elsewhere.

**Doses** (`dosePriceOf`): a dose costs its product's three latest purchases on or before the dose, their price over the doses they held. A product not yet bought by then is uncosted, and counted as such.

**Vet Fees** are split evenly across the animals the Vet named. A fee naming nobody is charged to nobody.

**`costs.ofAnimal`** (the Owner's and the Manager's) covers her whole time on the farm:
- feed, unpriced kg, medicine, uncosted doses and vet visits;
- purchase and sale price;
- **Margin**, once sold;
- **Cost of Gain**: over her gain from arrival weight to sale weight or latest Weigh-in;
- for a cow in milk, her current **Lactation**: its costs, litres to Bulk and **Cost per Litre**.

**`costs.bySide`** (a period of up to a year):
- the Dairy side's feed, medicine and vet visits, its litres to Bulk and Cost per Litre;
- the Fattening side's feed, medicine and vet visits;
- apart from those, the fattening animals sold in the period, each with her whole-life Margin, and their total;
- the unallocated feed.

Each animal's shares go to the Side she was on at the time.

**Web:**
- a cost section on the animal's page, fetched only for the Owner or Manager;
- the by-Side report on the Money page, for the dates it is showing.

The glossary gains **Margin**, **Cost per Litre** and **Cost of Gain**, and the Feeding entry says how a Feeding is charged.

**Five tests** in 2039, with a real feeding round, milking, campaigns, a Vet visit and a Sale:
- **Bull A:** fed alone on the first morning and split with bull B on the next, one costed dose, half a Vet visit, a Margin of 8,950 and a Cost of Gain of 52.5.
- **Bull B:** an uncosted dose and no Margin; fed alone after bull A left.
- **A cow** fed as an in-calf heifer and again after calving: her whole feed, but a Lactation Cost per Litre over the second morning. Her six litres under a Withdrawal are not litres to Bulk.
- **The period by Side:** a Pen fed with its heifer just moved out, as unallocated; a later period selling nobody and with nothing unallocated.
- **Barn Staff and the Vet** are refused both.

**Mutation-checked, each red:**
- the feed not split, or an arrival or a departure ignored;
- unpriced kg not said;
- an uncosted dose as free, or the whole lot's price charged per dose;
- the Margin without costs, the Cost per Litre wrong, or a vet fee not split or not in the Margin;
- discarded litres counted, or a Sale before the period counted;
- the Lactation read as a whole life;
- unallocated feed dropped or read for all time;
- the Cost of Gain wrong, or the sale weight ignored.

## What the review changed

The Standards and Spec reviews ran in parallel. Changed:

- **Cost of Gain added.** Story 76 asks for it and no ticket had it.
- **Vet Fees are charged to the animals the Vet named,** per the finance decision's "vet fees to the animal(s) on the visit note". They are in the Margin, the Cost of Gain and the Cost per Litre.
- **A cow's Cost per Litre is over her current Lactation,** not her whole life with its calf and heifer years.
- **The report keeps two sums apart:** the period's feed and dose totals, and the whole-life Margins of the animals sold in the period. They had read as one sum. The sold animals are chosen by the Side they were on when sold.
- **Unallocated feed is read for the period,** with its unpriced kg.
- **Order and rounding:**
  - moves and medicine purchases at the same instant are ordered by id;
  - prices are rounded only where the totals are.
- **Speed:**
  - shares are indexed by animal once;
  - which Side an animal was on is read from her own Pen history, not by scanning the farm's.
- **Code tidying:**
  - the grouping helper no longer copies its lists;
  - Feeding lines are narrowed rather than asserted;
  - the Side type and the kilo and litre rounding come from the domain;
  - the owner-or-manager check is one hook;
  - a new "Stay" term became the glossary's Pen history.
- **Wording:** "Litres to the tank" is now "Litres to Bulk", and the Bangla for Margin is "মার্জিন" rather than "লাভ" (profit).

## Left open

- **Every cost figure loads the farm's whole history,** for a single animal too. Proportionate for 100–500 head over the first years, but it will slow as the years pile up. A stored allocation, or one bounded to the Pens she stood in, is the next step when it matters.
- **"Recent purchases" is taken as the last three.** No spec gives the number. A dose given before its product was ever bought stays uncosted even after the farm buys it.
- **A dairy-born calf moved to Fattening carries his rearing costs into his Margin,** at a purchase price of nothing. That is his whole-life economics, but the Owner may want the rearing apart.
- **A Vet Fee naming no animals,** including one entered by hand, is charged to nobody and not reported as unallocated.
- **Price lookups at the exact moment of a Purchase are not tested.** A Purchase arrives at the farm day's midnight, and no Feeding is recorded then.
- **The by-Side report is on screen only.** Its CSV belongs with the accountant export, ticket 54.
