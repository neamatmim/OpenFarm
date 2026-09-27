# What the money in cattle returns — spec

**Source:** the map [OpenFarm: what the money in cattle returns](../openfarm-roi/map.md). All ten of its tickets were decided with the Owner on 2026-09-27:

- [How a cattle return is measured](../openfarm-roi/issues/01-how-a-cattle-return-is-measured.md) (research)
- [How a mudarabah return is stated to investors](../openfarm-roi/issues/02-how-a-mudarabah-return-is-stated.md) (research)
- [What a run of the Farm's own cattle is](../openfarm-roi/issues/03-what-a-run-of-the-farms-own-cattle-is.md)
- [What a return counts](../openfarm-roi/issues/04-what-a-return-counts.md)
- [How a return is put per year](../openfarm-roi/issues/05-how-a-return-is-put-per-year.md)
- [What cattle still standing return](../openfarm-roi/issues/06-what-cattle-still-standing-return.md)
- [The bank rate beside it](../openfarm-roi/issues/07-the-bank-rate-beside-it.md)
- [What the dairy herd returns](../openfarm-roi/issues/08-what-the-dairy-herd-returns.md)
- [What an Investor reads of a return](../openfarm-roi/issues/09-what-an-investor-reads-of-a-return.md)
- [Prototype where the Owner reads returns](../openfarm-roi/issues/10-prototype-where-the-owner-reads-returns.md)

**Vocabulary** is in `CONTEXT.md`: **Season**, **Return on Cost**, **Return on Capital**, **Bank Rate**, **Head Price**, **Target Window**, **Settlement**, **Margin**, **Internal Sale**, **Investor Statement**. **ADR 0012** covers what Investors read.

**Research:** [`measuring-a-cattle-return.md`](../../docs/research/measuring-a-cattle-return.md) and [`stating-a-mudarabah-return.md`](../../docs/research/stating-a-mudarabah-return.md).

**Layout:** variant B of the prototype on branch `prototype/owner-reads-returns` (`/months?variant=B`), with the Owner's verdict in `apps/web/src/prototype/OWNER-RETURNS.md`. Its figures are invented and its copy is a starting point.

**Status:** ready for an agent. Tickets are in [README.md](./README.md).

---

## Problem Statement

OpenFarm tells the Owner what each sold bull made (**Margin**), what a Venture paid out (**Settlement**), what a litre and a kilo of gain cost, and the farm's money month by month. None of it says what the money **returned**: what it made against what was put in and how long it was tied up. So the Owner can't answer the questions a farm owner asks:

- **Did this Eid's buying pay better than last Eid's?** There is no group for the Farm's own fattening cattle, only animals one by one.
- **Was the Venture better money than my own cattle?** A Season and a Venture are worked out two different ways today.
- **Would the bank have done as well?** Nothing is put as a rate a year, and there is nothing to set a bank's rate beside.
- **Is this cow paying for herself?** A bought cow's price is recorded nowhere, and a cow's milk is only read against her keep over the last weeks.

The sums that exist also mislead when added up:

- **A dead animal has no Margin**, so a sum of Margins leaves out every animal that died.
- **A calf bred here counts as bought for nothing**, so the fattening side gets the dairy herd's calf free.

## Solution

- **A Season** is the Farm's own fattening cattle aimed at one Target Window: one per Eid, or a window that is no Eid on its own. An animal stays in it however she goes, and it is finished when the last has gone.
- **A Season is worked out as a Settlement is**, so a Season and a Venture are one sum: what the animals fetched, less what they cost to take on and everything charged to them while they were its own. The dead are in.
- **Return on Cost** is that result for every hundred taka it cost. **Return on Capital** is the Investors' share of a Venture's profit for every hundred taka of their capital. Each is put per year simply, over the days the money was actually tied up (money × days). There is no rate a year under the Owner's floor (60 days by default) and none until the last animal has gone.
- **Still going, it is a range at today's price**, «আজকের দামে» and «অনুমান, ফল নয়».
- **Each dairy animal is her own run**, from birth or from a price the Owner enters, valued while here at the Owner's **Head Prices**. Every calf is her own, shown beside her dam.
- **A Bank Rate** the Owner types, dated, sits beside every finished rate a year, locked on the day the money went in.
- **A Returns page under Money**, with the same figures on the Venture page, above the Fattening board, on the cow's page and linked from Month by month.
- **Investors read a settled Venture's Return on Capital as a share over its own days**, on the portal and the হিসাব নিকাশ, behind a switch that stays off until the advisers see it. Never a rate a year (ADR 0012).

## User Stories

### A Season and its return

1. As the Owner, I want the Farm's own fattening cattle grouped by the Eid they were fed for, so that I can judge one Eid's buying against another's.
2. As the Owner, I want a window that is no Eid (a winter market) to be a Season of its own, named by its dates.
3. As the Owner, I want a bull sold early, or kept on after his Eid, to stay in the Season that bought him, so that a bad buy shows where it was made. A Season is finished only when its last animal has gone.
4. As the Owner, I want an animal that died counted with her cost and nothing back, so that a Season's return is never flattered by leaving her out.
5. As the Owner, I want a Season's result worked exactly as a Settlement is, so that a Season and a Venture read side by side.
6. As the Owner, I want each finished Season's and Venture's **Return on Cost** as «প্রতি ১০০ টাকা খরচে … টাকা লাভ», with the days the money was tied up on average and the rate a year after them, so that runs of different lengths compare.
7. As the Owner, I want the working behind a rate a year to open under it (what it cost, what came back, the average days, the sum), so that I can check it.
8. As the Owner, I want no rate a year for money tied up fewer days than my floor, with the share and days still shown, so that a few weeks' run is never scaled into a wild figure.
9. As the Owner, I want to set that floor myself (60 days by default).
10. As the Owner, I want a loss shown the same way as a gain, below nothing, rate a year included.
11. As the Owner, I want one sentence beside every return saying wages, sheds, equipment, dung and the money's own cost are not in it, so that I don't compare it with a study that charges them.

### A Venture

12. As the Owner, I want a settled Venture's **Return on Capital** (the Investors' share of the profit over all their capital, idle capital included) beside its Return on Cost, named apart.
13. As the Owner, I want the Farm's share of a Venture shown in taka, never as a ratio.
14. As the Owner, I want the Venture page to show its returns beside its Settlement, and a running Venture's range, each linking to the Returns page.

### Still going

15. As the Owner, I want a Season or Venture still going to show its Return on Cost at today's price as a low–high range, with the part already sold and the part still standing as two lines, labelled «আজকের দামে» and «অনুমান, ফল নয়».
16. As the Owner, I want no rate a year and no Return on Capital until it has finished.
17. As the Owner, I want an animal who can't be valued left out whole and named beside the figure with what puts her right: no price a kilo, no weight, or not yet priced.
18. As the Owner, I want the running Season's range and its missing prices in a strip above the Fattening board.

### Joining a Season

19. As the Owner or the Manager, I want crossing an animal from Dairy to Fattening to ask for her Target Window, defaulting to the next Eid, so that she joins a Season and is suggested for sale like a bought bull.
20. As the Owner, I want to price each crossing (her weight that day × a rate a kilo, with a note of where the rate came from), so that she enters her Season at what she is worth. Until I do, her Season says it is not yet a result.
21. As the Owner, I want an animal the Farm buys from a Venture, the wind-up buy-back included, to join a Season at the Internal Sale's price and be given a Target Window, defaulting to the next Eid.
22. As the Owner, I want an animal the Farm sells to a Venture to leave her Season at the Internal Sale's price, as a Sale would.

### Breaking a Season down

23. As the Owner, I want a finished Season to open into its Return on Cost by haat, by trader, by breed and by buying weight, and into each animal's cost, what came back and share, so that I can judge the buying. A breakdown shows the share only, never a rate a year.

### The Bank Rate

24. As the Owner, I want to type a bank's rate a year with a note of what it is (before tax, as the bank quotes it), dated from the day I type it, with the old ones kept.
25. As the Owner, I want every finished rate a year to show, as a plain line, the Bank Rate in force on the day its first taka went in, and the chart to mark it.
26. As the Owner, I want no Bank Rate line at all while I have typed none, and never beside a share, a running figure or anything under the floor.

### Dairy

27. As the Owner, I want each dairy animal's Return on Cost over her whole stay: a heifer bred here from birth at nothing, a bought cow or one here before the books began from a price I enter.
28. As the Owner, I want her milk sent to Bulk counted at what each month's Dispatches fetched, and her cull sale or crossing price at the end.
29. As the Owner, I want every calf to be her own run, with a cow's calves shown beside her, so that a fertile cow is seen and no calf is counted twice.
30. As the Owner, I want to set a low and a high **Head Price** for calf, heifer, pregnant heifer, cow in milk and dry cow, so that a dairy animal still here has a value today.
31. As the Owner, I want a cow's return and her calves' on her own page.
32. As the Owner, I want a cow named on the Cull list to show her return so far beside her reasons, never as a reason.

### The Returns page

33. As the Owner, I want a Returns page under Money that opens with every price still missing, each leading to where it is typed.
34. As the Owner, I want a chart of each finished rate a year, the Bank Rate marked on each.
35. As the Owner, I want Fattening, Dairy and Prices tabs: finished then running Seasons and Ventures; the herd now and each dairy animal gone with her calves; the Bank Rate history, Head Prices and prices outstanding.
36. As the Owner, I want Month by month to point to it in one line under the year's figures.
37. As the Manager, I see none of it: money is the Owner's alone.

### Investors

38. As an Investor in a settled Venture, I want to read my Return on Capital as «প্রতি ১০০ টাকা মূলধনে … টাকা লাভ» over the Venture's own days, under my payout in taka, on the portal's Venture page and on my হিসাব নিকাশ, with a loss shown the same way.
39. As an Investor, I never see a rate a year, a figure blended across my Ventures, a bank rate, or a past result beside an offer.
40. As the Owner, I want all of it behind a switch that stays off until the lawyer and the Shariah scholar have seen the wording, and I want to see it in the Portal Preview meanwhile.

## Implementation Decisions

### The arithmetic, in the domain package

- **`packages/domain/src/returns.ts`**, pure:
  - **`returnOf({ spent, back, today, floorDays, finished })`**:
    - `spent` is a list of `{ bdt, from, until }`: each taka, the day it was spent, and the day its animal left (or `today` while she stands).
    - `back` is the taka that came back.
    - It returns `{ costBdt, resultBdt, per100, averageDays, perYear }`:
      - `per100 = result ÷ cost × 100`, one decimal;
      - `averageDays = Σ bdt × days(from, until) ÷ cost`;
      - `perYear = per100 × 365 ÷ averageDays`, simple, only when `finished` and the average days, rounded to whole days as shown, `≥ floorDays`, else null (so money said to be out 60 days is never refused a year by a floor of 60).
  - **`returnOnCapitalOf(capital, shareBdt, floorDays)`**, with `capital` as `{ bdt, arrived, paidBack }[]`: the same sum over each taka from its arrival to its payout.
  - **`runningRangeOf(sold, standing, prices)`**: the low and the high `returnOf` for a run still going; `perYear` is always null.
  - **Unit tests** cover the example the grilling used:
    - ৳10 lakh of bulls over six weeks, ৳4 lakh of feed over five months, ৳17 lakh back gives 21 on every 100, about 50 a year;
    - a loss;
    - the floor;
    - a zero cost refused.
- **`seasonOf(window)`** in `packages/domain/src/eid.ts`: `expectedEidNear(window.start)` when the window is an Eid's, else the window's own dates. It is the Season's key.

### What a Season and a Venture are worked from

- **`packages/api/src/returns-store.ts`** reads the costing once (`farmCosts`, `ownedThenByOf`) and narrows it, never a second sum:
  - **A Season's animal:**
    - Taken on at her Intake's price on her arrival day when the Farm bought her. A joining (below) enters at its price on its day.
    - Charged every share where she was the Farm's that day (`ownedThenBy … === null`) and on the Fattening side (`sideOf`), from the day she joined.
    - Back: her Sale's price if the Farm sold her, an Internal Sale's price if the Farm sold her to a Venture, or nothing if she died.
    - `until` is that day, or today while she stands.
  - **Her Season** is `seasonOf` her latest joining's window, else her Intake's.
  - **A Venture's Return on Cost** is worked exactly as a Season's is — its holdings (Intakes on its money, Internal Sales to it), each share while it was hers, what each fetched — which is the costing `whatItWasCharged` adds up for its Settlement; a test holds the two totals equal.
  - **A Venture's Return on Capital** is worked from its `capital_in` and `payout` Venture Movements per Agreement, and the Investors' share from the approved Settlement's payouts. It is only for a Settled Venture.
  - **Order:** Seasons and Ventures newest window first, ties by key then id.

### Joining a Season

- **`fattening_joining`** is one row each time an animal comes to the Farm's Fattening side other than by Intake:
  - `id`, `farm_id`, `animal_id`, `joined_on` (the farm day)
  - `how`: `crossed` | `bought_from_venture`
  - `move_id` or `internal_sale_id`, whichever made it
  - `target_window_start`, `target_window_end`, `target_weight_kg` (the Farm Parameter's default, as an Intake's is)
  - the price: `price_bdt` (null for a crossing until the Owner prices it), `weigh_in_id`, `rate_bdt_per_kg`, `note`, `priced_by`, `priced_at`
- **A crossing records one** in the Move's own transaction:
  - The **Move entry gains an optional `targetWindow`**, sent only when `toSide` is Fattening. It is absent from a phone that queued the Move before this shipped, and then the next Eid from `nextEidWindow(the Move's day, announced days)` stands in.
  - The entry parity test covers both.
  - A Correction that takes the crossing back takes its joining with it, keyed on the Move.
  - Dairy→Fattening only; a crossing back to Dairy ends nothing but her time on the side.
- **`returns.priceCrossing({ joiningId, rateBdtPerKg, note })`**, Owner-only and audited:
  - The price is her latest Weigh-in on or before `joined_on` × the rate.
  - With no Weigh-in it refuses, as the wind-up buy-back refuses an unweighed animal: `crossing_unweighed`.
  - A price may be put right by pricing again, and the trail keeps both.
- **An Internal Sale to the Farm records a joining** at its own price:
  - Its input gains an optional `targetWindow`, defaulting to the next Eid.
  - The wind-up buy-back gives every animal it takes one window, defaulting to the next Eid.
- **Where a window is read** (the Ready-for-Sale suggestion, projected weight, the Fattening board, `fattening-store`, `ready-store`): an animal's latest joining, else her Intake. Test that a crossed animal is suggested once her window opens. The map found (unproven) that one today never is.

### Dairy

- **`dairy_entry_price`**, one per animal: `animal_id`, `price_bdt`, `as_of` (the day her stay starts; her registration day by default), `note`, `set_by`, `set_at`.
  - It is set and put right by the Owner through `returns.priceCow`, audited.
  - A cow born here has none and needs none.
- **`head_price`**, one per farm per kind: `kind` (`calf` | `heifer` | `pregnant_heifer` | `milking` | `dry`, matching the animal's state), `low_bdt`, `high_bdt`, `set_by`, `set_at`.
  - Set through `returns.setHeadPrice`, audited.
  - `low ≤ high` and both positive, or it refuses with `head_price_backwards`.
- **A dairy animal's run:**
  - It starts at birth at nothing, or at her `dairy_entry_price` on its `as_of` day.
  - It is charged her shares while she was on the Dairy side.
  - Back is:
    - each month's litres to Bulk (`costs.ofAnimal.litres`) × that month's `milkPriceOf` over its Dispatches. A month with milk and no Dispatch takes the latest earlier month's price, and the page says which months did;
    - plus her Sale, or her crossing's price when she crosses.
  - It ends at her Sale, her crossing, or her death.
  - While here she counts at her state's Head Price, low and high.
- **Her calves** are her own runs, listed beside her by `dam_id`.

### The Bank Rate and the floor

- **`bank_rate`**: `id`, `farm_id`, `per_year` (numeric, 0–100), `note`, `from_day`, `recorded_by`, `recorded_at`.
  - It is never edited: a new one supersedes from its day.
  - The rate in force on a day is the latest `from_day` on or before it, ties by `recorded_at` then `id`.
  - Written through `returns.setBankRate`, audited.
  - A Season's or Venture's rate is the one in force on its earliest `from` (its first taka).
- **`farm.return_year_floor_days`** (60, 1–365): an Owner Farm Parameter in a new "Returns" group, set through `farm.setParameters`, with its refusal words.

### Reading it

- **Router `returns`**, Owner-only (`requireOnly("owner", OWNER_ONLY)`; its writes also `requirePersonalSession()`, as `fattening.setMarketPrice` does, while its reads do not, as `home.byMonth` does not), a Manager FORBIDDEN:
  - `returns.page`: everything the page shows (finished, running, dairy, prices, gaps).
  - `returns.venture({ ventureId })`, `returns.runningSeasons()` and `returns.animal({ animalId })`: the same sums, for the strips.
  - `returns.breakdown({ seasonKey, by })`, with `by` one of `haat` (her Buying Trip's `went_to`, or «খামারের গেট» with none), `trader` (the Intake's Counterparty), `breed`, `band` (the Weight Band her Intake weight fell in) or `animal`. Share only.
  - Writes: `setBankRate`, `setHeadPrice`, `priceCrossing`, `priceCow`.
- **Web:**
  - Route `/returns`, `onlyFor("owner")`, listed under Money after Month by month as `nav.returns` («খাটানো টাকার ফল» / "Returns"). Components go in `apps/web/src/components/returns/`.
  - The layout is prototype variant B:
    - the missing-prices strip first;
    - the chart of rates a year with the Bank Rate marked;
    - Fattening, Dairy and Prices tabs;
    - each finished row opening into its working, Return on Capital and breakdowns;
    - the left-out sentence at the foot.
  - Strips, each linking to `/returns`:
    - the Venture page (Owner only);
    - above the Fattening board (Owner only, as the animal prices are);
    - the dairy animal's page;
    - a column on `/culling`;
    - one line under Month by month's year figures.
  - The crossing Move form shows the Target Window, next Eid first. The Internal Sale form and the buy-back ask for one when the Farm is buying.
- **Words:** every string in `bn` and `en` together. Numbers in Bangla sentences are worded where the string is built, pinned to `bn`. None may say ROI, মুনাফার হার, a bare «বার্ষিক রিটার্ন», সুদ, নিশ্চিত, নির্ধারিত or ফিক্সড. A rate a year is always «বছরের হিসাবে», after the share and its days.

### Investors

- **`farm.investor_returns`** (default false), switched by `investors.setReturnsShown`, Owner-only and audited, as `setProjectionsShown` is.
- **`portal-reads`**: a settled Agreement gains `returnOnCapital: { per100, days } | null`, that Investor's own share over their own days. It is shown only when the switch is on, and always in the Portal Preview.
- **The হিসাব নিকাশ** (`settlementStatementFor`) prints the same share line under the payout while the switch is on. A statement already made is not remade.
- **Nothing else changes for Investors**: no rate a year, no blend across Ventures, no Bank Rate, nothing beside an offer, and the Projection stays in taka.

## Testing Decisions

- **The seam is the oRPC router**, as for every money ticket. `returns.ts` and `seasonOf` get unit tests in the domain package.
- **Farm figures narrow both money and animals.** Every Season test includes a Venture-owned animal sold in the same window, or the double count passes green.
- **A Season:**
  - an animal sold before her Eid and one kept after it stay in it;
  - one who died is in with nothing back;
  - a non-Eid window is its own;
  - an announced and an expected window of one Eid are one Season;
  - a Season with one standing animal is not finished.
- **One sum:** a Venture's Return on Cost uses the same charges as its Settlement. Assert the two totals agree.
- **Per year:**
  - the floor on both sides of it, the floor changed by the Owner;
  - a loss;
  - money × days against a hand-worked example with feed spent over days.
  - **Prove the floor and the finished guard by switching each off.**
- **Joining:**
  - a crossing with a window, and one without (an old phone's entry), which gets the next Eid;
  - pricing refused unweighed;
  - a corrected crossing takes its joining;
  - an Internal Sale in and out;
  - the buy-back's window;
  - a crossed animal suggested for sale once her window opens.
- **Bank Rate:** two rates, a Season whose first taka fell before the second reads the first; none typed means no line.
- **Dairy:**
  - a cow bred here from birth;
  - a bought cow unpriced (a gap) then priced;
  - a month with milk and no Dispatch;
  - a bull calf's run ending at his crossing price, and his dam not counting him;
  - a Head Price missing for a kind (a gap).
- **Owner-only:** a Manager gets FORBIDDEN on each procedure and never sees a strip.
- **Investors:**
  - with the switch off, nothing in the portal or the paper; on, the share and days only;
  - the Preview shows it either way;
  - **assert no rate a year appears anywhere in the portal answer or the paper text**, and prove it by adding one.
- **Every ticket ends with somebody opening the page:**
  - `/returns` in both languages;
  - the strips in place;
  - the portal at phone width;
  - the হিসাব নিকাশ by print preview cloned into an overlay.

  Web component tests are not collected.

## Out of Scope

- **The whole farm's return** on land, sheds and equipment. Nothing records them as capital.
- **Using a return to set a Venture's terms.**
- **The Manager reading returns.**
- **A running Return on Capital, and the Projection as a share or a rate.** Ruled out for Investors in ADR 0012. The Owner's running Return on Cost covers the Owner.
- **Charging a Season wages, sheds or interest**, or a second study-like figure. The sentence says what is left out instead.
- **Dung as income.** It is booked as the Farm's under manure sales, not by animal.
- **What the lawyer and the Shariah scholar say** about the Investor wording. It comes back as a change to the switch's words, or a new map.

## Further Notes

- **Old cached answers:** the web app draws a 14-day persisted cache first. New fields on existing answers (a Venture's, an animal's, the portal's settled Agreement) default to null or empty when missing.
- **Month by month is unchanged.** Its "Margins on fattening sold" stays a sum of Margins, the Farm's own. The Returns page is where the dead are counted.
- **The seed** needs:
  - a finished Farm Season (last Eid);
  - a dead animal in it;
  - a crossing priced and one not;
  - a bought cow with a price and one without;
  - Head Prices for four kinds of five;
  - one Bank Rate.

  Otherwise every screen is empty or all gaps.

- **Grep CONTEXT.md** before naming anything new. "Joining", "left-out sentence" and "missing prices" are words in this spec, not glossary terms.
