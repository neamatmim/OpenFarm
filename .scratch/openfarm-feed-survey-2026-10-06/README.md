# Survey of the feed store, 2026-10-06

Three reviewers each took one part: stock and counts, feeding and feed money, and the feed screens. Each finding is marked:

- **Proven:** a temporary test went red against main at 3da53cf5, and the file was then deleted.
- **Traced:** read line by line through the code.

Feed's Stock on Hand is already replayed in time order (`replayStore`, domain/feed.ts), so most of the medicine store's count defects are not here.

## A. Stock, counts and Lots

1. **Proven, high.** Feed that arrives later on the same day as a Stock Count is wiped out by the count. An arrival is dated at midnight of its day, so it sorts before a morning count.
   - Example: a Friday 10:00 count finds 100 kg, and a 1000 kg lorry arrives at 16:00. Stock on Hand shows 100.
   - The medicine store has the same shape: a purchase is dated at the start of its day. `stock-store.ts:834-843`, `effects/stock-count.ts:68`, `domain/feed.ts:392-396`, `medicine-stock.ts`.
2. **Proven, high.** Feed Lots repeat the medicine Lot defect: everything ever used is taken first-to-expire across every Lot, including Lots bought after.
   - Example: Lot A, 100 kg with no expiry, is counted out. Lot B, 100 kg expiring on the 20th, then comes in. B shows 0 left, so its expiry is never warned of.
   - `stock-store.ts:306-316`, `lots.ts:37-47`, `lot-notices.ts:101-134`.
3. **Proven, medium-high.** A count that matched when it was recorded drops out of the adjustments list and the shortfall money, even after a late entry makes it short. `stock-store.ts:595,645,722-752`.
4. **Traced, low.** After feed is given from a delivery nobody recorded, the next count asks for a reason and books a surplus that does not exist. `stock-store.ts:575-590`, `domain/feed.ts:456-473`.

## B. A feeding as it was

The root: the feeding effect works out the Ration and the head count from the Pen as it stands when the Step reaches the farm, not as it stood when the Pen was fed.

1. **Proven, high.** A recorded meal is thrown away when the Pen's Ration has changed since. Lines for a feed not on the current Ration are dropped, so they never leave the store and are never charged.
   - Example: a Pen is fed 6 kg of concentrate on Ration A and moved to hay two days later. Correcting only its leftover then loses the concentrate.
   - A new Ration with no Version before the work was raised stands the entry aside.
   - The work sheet shows the new Ration's lines, or none. `effects/feeding.ts:41-67,91-101`, `feed-store.ts:354-361`, `routers/work.ts:384-392`, `evidence-sheet.tsx`.
2. **Proven, medium.** A Correction rewrites the session's target from today's herd. Example: a Pen of 4 animals was fed in full; 4 more arrive. Correcting the leftover turns the record into 8 animals and 54% short, flagged.
3. **Proven, medium.** A late Feeding from an offline phone is targeted on the animals there at sync, not when they were fed, while the cost split uses when they were fed. A weight read for it may be from a weigh-in after the feed.
4. **Traced, low.** A Leftover may be more than was given (12 left of 10 given reads 120% wasting). `step-completion.ts:41-45`.
5. **Traced, low, needs the Owner.** The standard playbook asks for the leftover "from the last feed", but the farm reads a Leftover as from the same Feeding. The flags are judged one session late. `domain/standard-playbook.ts:76-91`, `domain/feed.ts:~300`.

## C. Retired feed and Harvest prices

1. **Traced, medium.** A feed can be retired while a Ration in use still names it. It keeps being fed, but can then never be counted, bought or flagged low, so its stock drifts unseen. `routers/feed.ts:250-256`, `feed-store.ts:310-320`.
2. **Traced, medium (blocks Settlements).** A Harvest recorded before its feed's Fodder Price is set can never be priced: a Correction refuses a price on a Harvest. The receive sheet does not warn. `routers/stock.ts:324-327`, `corrections/feed-arrival.ts:40-42,111-114`, `settlement-store.ts:289`.
3. **Traced, low.** A Ration naming a retired feed cannot be saved until that line is cleared, and nothing beside the line says so. `feed-rations.tsx:271-283`.

## D. Feed screens

1. **Traced, medium.** "Bought this month" counts Harvests nobody paid for. `routes/_authenticated/feed/route.tsx:95-100`.
2. **Traced, medium-low.** Feed history stops quietly after the newest 200 arrivals across all feeds, and is filtered in the browser. `routers/stock.ts:133`, `feed-history.tsx:384-388`.
3. **Traced, low-medium.** The receive sheet's day is fixed when the page loads, so a page left open overnight records this morning's lorry under yesterday. `receive-feed-sheet.tsx:65,329-331`.
4. **Proven/Traced, low.** Figures the screen takes but the server always refuses, in English: a correction's price 0 or quantity 0.04; a receive quantity under 0.1; a bag size of 0 or over 200; a low-stock level of 0.
5. **Traced, low.** A bought feed with no price yet is called "From our own fields". `feed-stock.tsx:338-339`.

## Decisions (the Owner, 2026-10-06)

- Build all four groups.
- C2: a Harvest cut before its feed had any Fodder Price takes the first one set. A price changed afterwards still applies only from then on.
- B5: the shed staff record what is left from the **last** feed, found in the trough before this feed goes in. The farm books it against the Pen's previous Feeding.

## Status

| Group | Branch | Status |
| ----- | ------ | ------ |
| A     | fix/feed-stock | Done (a delivery written down on its own day comes in at that moment — `cameInAt`, for feed and medicine; feed Lots replayed with `replayLots` in domain/lots.ts, which medicine now shares; every count line read again, so a matched count shows once a late entry makes it short; a count compared with the book floored at nothing — `countedOverTheBook`) |
| B     | fix/feeding-as-it-was | Done (a Pen's Ration history kept as `pen_ration_spell`, migration 20261006100519, backfilled from each Pen's current Ration; a Feeding read against the Ration of its work's raising and the animals standing when fed (`animalsInPenAt`); a Correction keeps the Feeding's own target and herd; feed given that was not owed is kept as a line; leftovers found at a feed are the feeding before's (`foundKg`, `passTheLeftovers`), never more than it gave; CONTEXT Leftover reworded) |
| C     | fix/feed-retire-harvest | Done (a feed is not retired while a Ration a Pen is on gives it — `feed_on_a_ration`; the first Fodder Price set prices the Harvests cut with none — the Owner's decision, CONTEXT reworded; the Ration editor says beside a retired feed's line to empty it) |
| D     |        |        |
