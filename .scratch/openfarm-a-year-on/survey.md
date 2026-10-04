# A year on: what slows down as the farm's history grows

2026-10-04. The Owner said "Next" after the roles/phone/numbers survey closed. Nothing earlier had asked how the app
holds up after a year on a 100–500 head farm, so this survey measures it.

## How it was measured

- `openfarm_year` is a copy of `openfarm_seed`, padded with older history. Each history table's rows were copied eight
  more times, shifted back in time, with ids and links suffixed so every constraint holds: work and step records,
  milking, weigh-ins, feeding, treatments, head counts, alerts, moves and the audit trail. Money was left out, because
  its bank references are unique and its tables are small.
  - The script is in the session scratchpad (`year/inflate.cjs`).
  - The copy's figures mean nothing; only its size does.
- Rows after padding:
  - 230,400 step records and 45,000 pieces of work
  - 45,000 milk records, 14,600 feedings and 5,100 weigh-ins
  - 360,000 audit events
  - 605 MB, against the seed's 86 MB
- That is roughly a year of a 300-head farm by row count. Milk is still under: 300 head would write about 110,000
  milk records a year.
- The calls were the ones 22 daily pages made in the browser, captured with their inputs. A script then timed each
  call three times as the Owner on the dev server (median below), on the seed and on the padded copy.
- A code search listed every read that loads a whole history with no date or row limit.

## What was measured (ms, dev server)

| Call                     | Seed |   A year on | Where it is read                                                     |
| ------------------------ | ---: | ----------: | -------------------------------------------------------------------- |
| `monthlyReport.get`      |  385 |       2,984 | Monthly report                                                       |
| `returns.list`           |  239 |       2,428 | Returns                                                              |
| `returns.runningSeasons` |  160 |       2,321 | Returns                                                              |
| `ventures.running`       |  145 |       1,785 | **Home**                                                             |
| `ventures.list`          |  151 |       1,753 | **Overview**, Ventures                                               |
| `alerts.sweep`           |  155 |       1,609 | **Home and Work on every open, the shed phone too**, and every 5 min |
| `costs.bySide`           |  137 |       1,586 | Costs                                                                |
| `stock.adjustments`      |  146 |       1,376 | Feed                                                                 |
| `costs.forAnimal`        |   55 |       1,073 | An animal's Money tab                                                |
| `fattening.prices`       |   85 |       1,068 | **Overview**, an animal's page                                       |
| `cullList.list`          |   79 |       1,048 | **Overview**, Cull list                                              |
| `home.get`               |   78 |         469 | **Home**                                                             |
| `overview.get`           |   88 |         458 | **Overview**                                                         |
| `stock.onHand`           |   65 |         444 | **Overview**, Feed                                                   |
| `work.overdue`           |   19 | 84 (2.6 MB) | Review queue                                                         |

Everything else stayed under 110 ms. The slow calls grew about ten times for nine times the history, and they keep
growing year on year.

## What makes them slow

1. **`farmCosts` (cost-store.ts:196) rebuilds the farm's whole costing from all its history on every call.**
   - It reads every animal ever, every move, every feeding with its lines, all feed movements, every treatment, every
     milking session with its bulk milk, and every hand-entered money event.
   - Nothing is shared between calls:
     - The Owner's overview runs it four times at once (`cullList`, `fattening.prices`, `ventures.list`, and
       `overview.get` once anything is written off as Lost).
     - Returns runs it twice per call (`booksOf` directly and through `pricesOnTheSide`).
     - The portal runs it up to three times.
   - The day-turn runs it **every 5 minutes** through `reimbursementsToTell`. For a Venture whose month came to
     nothing, it never writes the notice, so the read repeats all month.
   - Writes run it inside their transaction: a Sale, a death, and corrections to feed and money.
2. **`alerts.sweep` runs on every open of Home and Work, the Barn Staff's page and the shed phone's, and twice there.**
   - The medicine-lot check (`lot-notices.ts:44`) never closes its gate once any lot has expired. It then reads every
     treatment ever (`medicineStockOf`) and all feed stock movements.
   - The receivable book (`readBook`) reads every credit sale, dispatch and payment ever: on Home, the overview, the
     Milk page and the sweep.
3. **Feed stock (`movementsByItem`) reads every delivery, feeding line and count ever.** `stock.adjustments` repeats
   the whole read once for each count among its latest 200 lines.
4. **`work.overdue` sends every open piece of work ever, with its procedure's full text: 2.6 MB.** Open work only
   closes when someone closes it as missed.
5. **Every save refetches everything on the open page** (`refreshTheScreen` → `invalidateQueries()`). So one save on
   the overview reruns all four `farmCosts` calls.
6. Smaller:
   - whole-life weigh-ins read where one is needed (last figures, early losses, expected gain, shrink);
   - `herdWithSides` reads every animal ever, for deaths and herd health on Home and the overview;
   - the heat watch and repeat breeders read whole life;
   - `animals.photo` reads the full photo when a thumbnail is asked;
   - N+1 reads in returns (one per crossing, one per Venture), the portfolio and farm accounts.

## Plans

### Y1. `farmCosts` once per change, not once per call (S–M)

- Keep the last costing per farm in memory, with a counter every audited write moves. A call when nothing was written
  since gets the copy kept. One process serves the farm (systemd), so memory is enough.
- On the overview, four rebuilds become one, and none until the next save. The 5-minute day-turn rebuilds only after
  a write.
- Writes inside a transaction must still read their own uncommitted rows, so they bypass the kept copy.
- Test: two reads with no write between rebuild once; a write between rebuilds again; a figure read after a feeding
  includes it.

### Y2. The sweep and the receivable book read only what is open (S)

- Gate the lot check on lots not yet expired.
- `readBook` reads only receivables with something still owed.
- Run the sweep once per page open, not twice.

### Y3. Feed stock: one read per request, not one per count (S)

- `stock.adjustments` reads the movements once and works every count from that one read.

### Y4. `work.overdue` lightened (S)

- Send what the review queue shows: the procedure's name, not its full content.
- Cap it, oldest last.

### Y5. `farmCosts` bounded by date for the period reports (M)

- The Monthly report, Costs by Side and Returns ask about a stretch. Read the costing from the stretch's start, with
  what each animal carried in.
- Wait to see what Y1 leaves first: with Y1, these pages pay once per change.

### Y6. Smaller reads (S each)

- One weigh-in per animal where one is needed.
- `herdWithSides` bounded by the year it reports.
- The thumbnail alone when a thumbnail is asked.
- The N+1 reads in returns, the portfolio and farm accounts.

### Y7. A save refreshes only what it touched (M, later)

- Narrower invalidation than the whole screen. Riskier, since a missed query shows a stale figure.
- Y1 takes most of the cost out of the broad refresh, so leave this unless the 30 days show it is needed.

## Recommended order

1. **Y1**: the biggest win, and it takes the 5-minute day-turn's cost with it.
2. **Y2**: the sweep sits on the staff's and the shed phone's page.
3. **Y3 and Y4**: small and contained.
4. Re-measure on `openfarm_year`, then decide on **Y5** and **Y6**.
5. **Y7** only if the farm's 30 days show it is needed.

## Progress

The Owner said "Yes" to the recommended order on 2026-10-04. Each item was built test first, re-measured on
`openfarm_year`, and merged. What the measurements showed changed the plan as it went:

- **Y1** 099a1592: `farmCosts` is kept per farm until the next write.
  - `writes-seen.ts` counts every audited write: once when its Audit Event is recorded, and again after its
    transaction commits.
  - A transaction always works the costing out afresh.
  - While tests run, the kept copy is frozen, so a reader changing it in place would throw. None does.
- **Y2 and Y3** d1e7c1e8: the feed store is kept the same way, through one shared keeper (`keptUntilAWrite`).
  - Stock adjustments now filter the one kept read instead of re-reading once per count.
  - The sweep's real cost was the store (437 ms of 640). The medicine-lot and receivable checks measured 3–6 ms, so
    they were left as they are.
  - The double sweep on the Work page is React's development StrictMode only.
- **Feed rate** 2c87c97d: `fedPerDayOf` asked the farm's day of every Feeding through the time-zone formatter, 21 ms
  per item. It now works out the fortnight's first moment once.
- **Monthly report** 3a1abc59: `narrowedToEach` sorts the year's charges into the 13 periods in one pass, instead of
  each period filtering all 1.26 million.
- **Ventures** 2fe15997: a Venture's charges are picked out once, not once a month. The running Ventures share one pass
  that sorts the charges by owner.
- **Y4** 31abd86c: `work.overdue` sends each late job's procedure name only.
- **Tried and dropped:** remembering the clock's UTC offset per quarter-hour. It was 3.5 times faster on repeats, but
  no page got faster. Its Kathmandu and zone-switch tests were kept (5359f1b3).

**A year on, after (ms, on repeat):**

| Call                      | Before | After |
| ------------------------- | -----: | ----: |
| Monthly report            |  2,984 |   405 |
| `returns.list`            |  2,428 |   512 |
| `ventures.running`/`list` |  1,785 |   248 |
| `alerts.sweep`            |  1,609 |   185 |
| `costs.bySide`            |  1,586 |   229 |
| `stock.adjustments`       |  1,376 |   195 |
| `costs.forAnimal`         |  1,073 |    10 |
| `fattening.prices`        |  1,068 |   132 |
| `cullList.list`           |  1,048 |    51 |
| `home.get`/`overview.get` |    469 |    51 |

**Left:**
- The first costing read after a save still rebuilds the costing once: about 1.1 s a year on. Everyone asking
  meanwhile shares that one rebuild.
- `farmCosts` keeps the whole history in memory, about a million charges a year on. Before Y1 it was built that size
  four times at once.
- Y5 (date-bounded costing), Y6 (the smaller whole-life reads) and Y7 (narrower refresh) wait on what the farm's first
  30 days show.
- `work.overdue` is still 1.3 MB on the padded copy. That is mostly the padding: each copy carries the seed's
  never-closed work, nine times over.

### Round two (2026-10-04, "Go with recommendation")

- **The costing rebuild measured.** About 1.04 s a year on.
  - Half of it (523 ms) is `feedShares` making about 1.2 million feed shares, one per item per animal per Feeding. The
    model needs those, and only date-bounding (Y5) shrinks them.
  - The rest is the reads: milk about 110 ms, feed about 100 ms, Feedings 73 ms.
  - `priceOf` already binary-searches.
- **Who pays the rebuild** 1e266bfc. The sweep, on every opening of the staff's page and the shed phone's, asked again
  about any Venture whose last month came to nothing. After any save that cost the whole rebuild. It now asks once a
  farm day. Since then only the Owner's and the Manager's pages pay the rebuild after a save.
- **Y6, measured first** a9a85210.
  - `animals.photo` read the full photograph to send a thumbnail. It now reads the thumbnail alone.
  - The whole-life weigh-in and herd-history reads measured 20–55 ms a year on, and were left.
- **Y5** waits on the farm's first 30 days: is a one-second rebuild on the Owner's overview after a save felt?
