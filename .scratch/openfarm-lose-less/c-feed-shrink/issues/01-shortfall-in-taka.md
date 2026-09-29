# 01 — The shortfall in taka, told to the Owner

**What to build:** Each Stock Count difference is priced in taka. The Owner is told when a count's shortfall passes the
farm's line, and sees the month's total.

**Blocked by:** —

**Status:** done, 2026-09-30.

- [x] **Domain** `shortfallOf(lines)` (pure, `feed.ts`): each difference × its own price, short and over kept apart,
      never netted; feed never bought (no price) adds nothing.
- [x] **API:** `recordStockCount` returns each difference's `priceBdt` (the store's average price at the count). The
      feed page's reading (`adjustmentsOf`, now over `readTheCounts`) adds `priceBdt` and `valueBdt`. `shortfallIn` adds
      up a period's counts in full — not the page's 200 lines — with how many counts were made.
- [x] **Farm Parameter** `store_shortfall_tell_bdt` (default ৳2,000), Owner-only (`WHEN_A_SHORT_STORE_IS_TOLD`), its own
      group "A short store" on the parameters page.
- [x] **Notice** `store_shortfall`: digest, Owner + Manager, about the Completion, raised by the count's effect — so told
      once; a count put right is not told again. Rounded to the taka. Leads to the Counts tab.
- [x] **Costs page:** "Feed missing at the counts" card beside Overheads (`costs.bySide.storeShortfall`): missing, found
      over, and the period's counts; said to be in no Side's costs and in no Overhead. The Owner's home was left alone:
      the notice reaches it, and the figure belongs with the costs.
- [x] **Feed page:** a value column ("মোট দাম" / "Value") on the Counts tab, missing in red; on a phone beside the
      difference.
- [x] **Glossary:** **Stock Count** widened (the Friday count, the Owner signing off, the pricing and the notice).
- [x] **Tests:** `routers/store-shortfall.test.ts` (6) — priced at ৳40 a kilo, feed never bought unpriced, told to Owner
      and Manager with ৳4,000; told once after a Correction; not under the line, not for feed found over; a delivery
      written up late but dated before the count moves its taka; a period's total beside the Overheads; the line is the
      Owner's to move. `feed.test.ts` (2) for `shortfallOf`. **Proved by switching off** the line (the "not under the
      line" test goes red).
- [x] **Seed:** no change needed — its Friday counts lose 2–6% of perishables and a little of the sacks, and every one of
      its thirteen counts came up ৳3,700–13,000 short, so each was told.
- [x] **Somebody opens it** (reseeded 2026-09-30): the Costs tab's card "গণনায় কম পাওয়া খাদ্য — কম ৳৫৮,৭৩৮, এই সময়ে
      ৪টি গণনা"; the Counts tab's value column; the Today alerts in English with "Open the counts"; the parameters page
      at ৳2,000.

**Found while looking:** the 4 September seed count was told at ৳11,337 and now reads ৳34,088 — silage written up after
the count but dated before it added 3,500 kg to what the store should have held. That is the count's rule (read against
the store as it now stands), not a defect: the notice says what the count showed that day, the page what it shows now.

**For the Owner:** on the seed every weekly count passes ৳2,000. A real farm that loses as much would hear every
Friday; the line is yours to raise.
