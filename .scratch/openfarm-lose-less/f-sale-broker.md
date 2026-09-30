# F — The broker's fee on a Sale (a defect)

**The defect** (survey F, checked): CONTEXT.md's **Selling Trip** said "A broker's fee for one sale is typed on that
Sale", and `trip-store.ts` said the same, but the `sale` table and `sale.record` had no such field. A fee typed by hand
became an Overhead, never the animal's cost, and a Venture never repaid it.

**Status:** done, 2026-09-30 — no Owner decision needed: the glossary had already said where it goes, and it follows the
Selling Trip it sits beside.

- **Schema:** `sale.broker_bdt` (default 0); money source `sale_broker` with its own standard Category "বিক্রির দালালি /
  Sale brokers" (out), made on first use. Migration `20260930120842_sale_broker`, both dev databases.
- **Charge:** new kind `sale_broker` in `CHARGE_KINDS` — hers alone, dated the day she was sold — counted with her trips
  (`tripBdt`, the Settlement's "trips" line, as the Buying Trip's broker already was), in every sum (Margin, Return on
  Cost, Settlement) and in `WHAT_THE_FARM_IS_OWED`: the Farm pays it, a Venture repays it in its Reimbursement, where
  the line reads "দালালি · F-0017".
- **Money:** booked in `bookSaleMoney`, so recording, the Sale's Correction and an Intake's Correction all keep it true:
  the Farm's purse, out, cash by default.
- **Screens:** "দালালের খরচ (৳)" on the sale sheet (optional); on the Sale's Correction; "দালালের খরচ" under "How she
  left" on her page; the money register names the source.
- **Glossary:** **Sale** says where the broker goes.
- **Tests:** `routers/sale-broker.test.ts` (4) — the Farm's money out and her cost; nothing without a broker; put right by
  the Correction with its money; a Venture's repaid and named. `holding.test.ts` — 8 kinds, owed as a Selling Trip, not
  her keep, counted with her trips. **Proved by switching off** her charge, the money, the Venture's repaying and the
  Correction — each red.
- **Somebody opens it** (seed, 2026-09-30): F-0017 sold for ৳1,95,000 with a ৳1,500 broker — two Money Events, ৳1,95,000
  in under "গরু বিক্রি" and ৳1,500 out under "বিক্রির দালালি"; her page read "দালালের খরচ ১,৫০০ টাকা", her trips
  ৳৪,২৪৯. The seed now holds that sale.

**Not changed:** the Investor papers name no selling costs; the Settlement's "trips" line (যাতায়াত / Trips) now carries
the sale's broker as it already carried the buying one.
