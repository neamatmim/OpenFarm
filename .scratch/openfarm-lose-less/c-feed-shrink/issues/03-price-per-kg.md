# 03 — ৳ per kg on each Feed Purchase

**What to build:** Each Feed Purchase shows its price per unit beside the last one. The Owner is told when it jumps.

**Blocked by:** —

**Status:** done, 2026-09-30.

- [x] **Domain** (`feed.ts`, pure): `unitPriceOf` (a Purchase only, never a Harvest), `purchasePricesOf` (each purchase
      beside the last purchase of the same feed by the day it came, then the order written — decision 5), `priceJumped`
      (a rise past the line, not at it, never a fall).
- [x] **Farm Parameter** `feed_price_jump_percent` (10), **the Owner's alone** (the Manager buys the feed).
- [x] **Notice** `feed_price_jump`: digest, the Owner only, about the `feed_in`, told once — on receiving, or by a
      Correction that now makes it dearer (`tellIfTheFeedCameDearer`).
- [x] **UI:** the receiving sheet shows "Last bought at ৳50 per kg, 27 September" before anything is typed, and "12%
      dearer than last time" as the price is typed (`stock.lastPurchase`); the arrivals list shows ৳ per unit and the
      change under each price, phone and desk (`PriceChange`). **Found there:** the list called a Harvest a Purchase once
      its fodder was priced (it read "no price" as Harvest) — now read by its kind.
- [x] **Glossary:** **Feed Purchase** widened.
- [x] **Tests:** `feed.test.ts` (4) and `routers/feed-price-jump.test.ts` (5) — by the bag per kilo, the Owner told and
      not the Manager; not at the line nor for a fall; a harvest never compared; a Correction re-read and told; the
      line the Owner's. **Proved by switching off** the harvest rule, the line, the Correction's telling and the Owner's
      gate — each red.
- [x] **Somebody opens it** (seed, 2026-09-30): the list read "প্রতি কেজি ৳৪৪ · আগের বারের চেয়ে ৭.৩% বেশি"; the
      sheet for গমের ভুসি read "শেষ কেনা ২৭ সেপ্টেম্বর, ২০২৬, প্রতি কেজি ৳৫০" and, at 100 kg for ৳5,600, "আগের বারের চেয়ে
      ১২% বেশি"; saved, the Owner's list read "গমের ভুসি কেনা হয়েছে প্রতি কেজি ৳৫৬-এ, আগের বারের ৳৫০-এর চেয়ে ১২% বেশি"
      (and in English). The seed now holds that lot.

**Also fixed:** `head-count.test.ts` looked her up by tag without her farm, and found another file's animal when run
with the whole suite.
