# Survey of the dairy, 2026-10-06

Three reviewers each took one part of the dairy: milking and milk money, breeding and calves, and culling with dairy Returns. Each finding is marked:

- **Proven:** a temporary test went red and the file was put back.
- **Traced:** read line by line through the code.

## A. Milk under Withdrawal, and old milk records

1. **Proven, high.** The Withdrawal gate checks only when a Withdrawal ends, never when it began. So a dose given _after_ a milking sends that milking to Discard (`forced`).
   - **Example:** a phone offline at 05:30 sends 11 L to Bulk, the Vet doses her at 07:00, and the record lands at 09:00 as discard.
   - Correcting a record from before a later dose does the same, through the Correction path.
   - The Session's Bulk sum, the tank check, the week's milk account, Cost per Litre, Cull and dairy Return all lose that milk.
   - `milk-store.ts:110-117`, `domain/milk.ts:28-32`.
2. **Proven, medium.** The production report marks milk as "under Withdrawal" from `record.forced`. A phone that correctly sent discard for a held cow gives `forced: false`, so the report shows withheld milk as poured away by judgement. `routers/reports.ts:219`.
3. **Traced, low.** Correcting or late-syncing an old milk record stamps it with the cow's _current_ Lactation, moving it into the wrong Lactation's totals. `milk-store.ts:101-103,119-132`.

## B. Milk money and the milk account

1. **Proven, medium.** Correcting a Dispatch's price after a write-off leaves more written off than is owed.
   - **Example:** ৳6,000 owed and ৳6,000 written off. The price is then corrected to ৳50, so ৳5,000 is owed, and the item shows ৳−1,000 paid.
   - Milk sold becomes negative on the monthly report and spreads to dairy Return and the Cull list's milk price.
   - `corrections/dispatch.ts:104-120`.
2. **Proven, low.** The unaccounted-milk line is compared as a rounded whole percent: 3.4% reads as 3%, and `3 > 3` is false, so 3.0–3.49% is never told. `domain/milk.ts:283`.
3. **Traced, low.** The Dispatch Correction sheet can't change the time (or fat, SNF or note), though the API takes them. A collection typed after midnight stays on the wrong farm day. `components/milk/handed-over.tsx:40-117`.
4. **Traced, minor.**
   - The calves' litres a day divides a week holding only part of today by 7.
   - The "giving less" list reads from `now − 9×24h` instead of a farm-day start, so it drops the oldest morning.
   - `dispatch-store.ts:225-238`, `milk-store.ts:214-221`.

## C. Breeding records

1. **Proven, high.** A cow who calved yesterday can be recorded calving again, which creates a second calf, adds a Lactation, and leaves a ghost calf on the herd. Nothing checks that a calving was expected or that she hasn't just calved. `herd-store.ts:742`, `domain/breeding.ts:293`, `calving-store.ts:229-246`.
2. **Proven, medium.** A calving dated before the service she conceived from is accepted. A later service then brings the old pregnancy back: an Expected Calving reappears, she is taken off the heat watch, and she is kept off the cull and repeat-breeder lists. `effects/calving.ts:32`, `breeding-store.ts:225`.
3. **Proven, medium.** A heifer served once drops off every heat watch for good: empty at the check, or aborted, she is on no list. This contradicts CONTEXT.md's Heat and Abortion entries. `domain/breeding.ts:450`, `breeding-store.ts:600,646`.
4. **Proven, low.** A heat seen on a two-month-old calf raises "Serve her" work, and the service is accepted, because nothing checks her state or age. `standard-playbook.ts:263`, `effects/service.ts:77`.
5. **Traced, medium.** A cow long past her Expected Calving with no calving recorded is on no list and gets no reminder. She is counted as in calf by the heat watch, the cull list and the repeat-breeder check. `breeding-store.ts:573`, `domain/cull.ts:175,185`.
6. **Traced, low.** "Correct Expected Calving" is offered on every carrying cow, but is always refused for one served on the farm (`calving_is_derived`). `breeding-tab.tsx:268`.

## D. Dairy money and calves

1. **Proven, high.** A crossing is priced from her latest weigh-in on or before the crossing, however old. The weaning weight has the same problem.
   - **Example:** a calf weighed 30 kg at birth, crossed four months later, and weighed 120 kg two days after crossing is priced at 30 kg.
   - So the dairy run's end is ৳36,000 short, and the Season cost is ৳36,000 low.
   - `joining-store.ts:115-143`, `effects/wean.ts:74-79`.
2. **Proven, medium.** `priceCow` accepts a start day that has not come yet, which empties her milk and keep before it. `routers/returns.ts:118-185`.
3. **Traced, medium.** Pricing an unpriced cow from her own page pre-fills today as her start day, not her registration day. Accepting it drops months of milk and keep. `dairy-returns.tsx:590-597`.
4. **Traced, low.** A culled cow is said to have "died" on the dairy Returns, because every mortality row is read as a death. `returns-store.ts:116-119,197`.
5. **Traced, low.** A calf weaned early by hand who dies before day 90 counts in neither the calf-loss nor the adult-death figure. `domain/calf-losses.ts`, `adult-deaths.ts:77`.
6. **Traced, needs the Owner.** Newborn care and calf doses count from when the calving was written down, not from the birth. Calf-care plan 02 chose recording time on purpose, but the playbook's dose comment says birth. A calf born at 22:00 and recorded at 06:00 is "due colostrum" ten hours late. `instances-store.ts:642-646`.

## Decisions (the Owner, 2026-10-06)

- Build all four groups.
- D6: newborn calf care and calf doses count from the **birth**, not from when the calving was written down. This replaces calf-care plan 02's choice.

## Status

| Group | Branch | Status |
| ----- | ------ | ------ |
| A     | fix/milk-withdrawal | Done (a hold no dose of hers can trace stays shut; the gate's answer is kept as `milk_record.under_withdrawal`, migration 20261006061322, backfilled from `forced`) |
| B     | fix/milk-money | Done (a Sale or Dispatch put right below its write-off is refused `owed_below_written_off`; the Dispatch Correction takes its time, fat, SNF and note) |
| C     |        |        |
| D     |        |        |
