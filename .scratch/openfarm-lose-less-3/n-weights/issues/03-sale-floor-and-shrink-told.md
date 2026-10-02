# 03 — A Sale floored on her last Weigh-in, and Shrink told

**What to build:** A fattening Sale's market floor is worked on her last recent Weigh-in less the farm's Shrink
allowance where that is heavier than the weight typed on the day; and Shrink over that allowance is told to the Owner.

**Blocked by:** —

**Status:** done (2026-10-03).

**As built:** `floorWeightOf` and `shrankPast` in `domain/shrink.ts`; `lastTrustedWeighIn` in `animal-price-store.ts`
reads both tellers' weighing. Only Weigh-ins count, not the weight she came in at — the arrival weight is a figure typed
at the haat, which is what the floor guards against. `sold_under_cost` gains `floorKg`/`floorFrom`, said after the low
price; an older notice says nothing more. The seed's third sale six days back is typed 14% light and priced at ৳565.

- [x] **Glossary:** **Sale** widened (the low price a kilo is set against the heavier of the day's weight and her last
      Weigh-in within three weeks less the farm's allowance); **Shrink** widened (over the allowance it is told to the
      Owner; still never refused).
- [x] **Schema:** Farm Parameter `farm.shrink_tell_percent` (default 8, 1–30), **the Owner's alone**, wired as
      `feed_price_jump_percent` was. Migration `…_shrink_tell_percent`, both dev databases.
- [x] **Rule:** domain `floorWeightOf({ saleKg, last, soldAt, allowPercent })` — the sale's kilos, or her last
      unflagged Weigh-in less the allowance where it is heavier and not older than `SHRINK_STALE_DAYS`; says which.
      `soldUnder` is called with it.
- [x] **Entry:** `tellIfSoldUnderCost` (`animal-price-store.ts:181`) reads her last unflagged Weigh-in before the Sale
      and floors on it; `sold_under_cost` facts gain the kilos it was worked on and whether they were the scale's or
      the day's. Beside it, `tellIfShrankTooMuch`: `shrinkOf` over the allowance on a reading not stale tells notice
      `large_shrink` (digest, Owner, about the Sale, once — a Sale Correction re-judges, as Sold under cost does) with
      tag, last kg and day, sale kg, percent. Both called where `tellIfSoldUnderCost` is (`routers/sale.ts:235`,
      `corrections/sale.ts:138`).
- [x] **Screen:** none new for the Manager — the sale sheet already shows Shrink as the weight is typed; the Owner's
      notices carry both.
- [x] **Tests:** `routers/sold-under-cost.test.ts` gains: weighed 400 kg last week, sold at "330 kg" for a price over
      330 kg at the low rate but under 368 kg — told, on the scale's weight; the same with a reading 30 days old — not
      told; a flagged reading is passed over. `routers/shrink.test.ts` gains: 12% told once, 5% not, stale not, a dairy
      cull not. **Proved by switching off** the floor (the typed weight alone), the stale cut-off, the flagged filter
      and the allowance — each red.
- [x] **Somebody opens it** (seed): sell a bull of the seed at a weight well under his last Weigh-in, and read the
      Owner's two notices with the kilos in Bangla.
