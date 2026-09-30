# 01 — Sold under cost, told

**What to build:** A Sale priced under her cost, or under the market low × the sale weight, is told to the Owner in the
evening post; the sale goes through.

**Blocked by:** —

**Status:** done, 2026-10-01.

- [x] **Glossary:** **Sale** widened: told, never refused; a dairy cull is not.
- [x] **Rule:** domain `soldUnder` (under cost; under her weight at the low price a kilo — `priceRangeFor`, her
      Venture's or the farm's market price; nothing while neither is set). `tellIfSoldUnderCost`
      (`animal-price-store.ts`) works her cost as the Owner's prices do — purchase and every charge, the sale's broker
      included — inside the sale's own transaction.
- [x] **Told:** `sold_under_cost`, digest to the Owner only, about the Sale (once, however often corrected); raised by
      `sale.record` and by the sale correction when the price or the broker changes. Links to her page by tag.
- [x] **Changed from drafting:** a **dairy** cow culled to a butcher is **not** told — her cost is her whole working life,
      and every cull would read as a loss. Fattening only.
- [x] **Tests:** `routers/sold-under-cost.test.ts` (5), domain `sold-under.test.ts` (3). **Proved by switching off** the
      call at sale, the call on correction, the dairy exclusion and the market comparison — each red. Not tested: a
      Venture animal priced at her Venture's plan (the same `priceRangeFor` the Owner's prices use).
- [x] **Somebody opens it** (seed, 2026-10-01, as the Owner): F-0019 sold for ৳60,000 at 300 kg in about half a second;
      the Owner's list read "F-0019 বিক্রি হলো ৳৬০,০০০-তে; তার খরচ পড়েছিল ৳১,৪৫,৩৬৭, আর কম দরে তার ওজনের দাম
      ৳১,৬৮,০০০", with a link to her.

**Worth watching:** the farm's whole costing now runs inside every Sale; on the seed it took well under a second.
