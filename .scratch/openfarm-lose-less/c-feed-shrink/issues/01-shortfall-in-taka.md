# 01 — The shortfall in taka, told to the Owner

**What to build:** Each Stock Count difference is priced in taka. The Owner is told when a count's shortfall passes the
farm's line, and sees the month's total.

**Blocked by:** —

- [ ] **Domain** `shortfallBdt(lines, price)` (pure): difference × the store's average price at the count
      (`stockLedger(...).averagePriceBdt`). Surpluses shown, not netted off.
- [ ] **API:** `adjustmentsOf` returns `priceBdt` and `valueBdt`. Add `stock.shortfallByMonth`, bounded by the month
      (`adjustmentsOf` stops at 200 rows, `stock-store.ts:~520`, so no total from it).
- [ ] **Farm Parameter** `shortfallTellBdt` (default ৳2,000), after `adjustmentThresholdBdt` (`schema/farm.ts:175`,
      `routers/farm.ts:158,201`).
- [ ] **Notice** `store_shortfall`, digest, Owner + Manager, once per count (entity the Completion). Wired as
      `baki_overdue` is: `alerts.ts`, `db/schema/alert-kinds.ts`, `notify.ts`, `notice-facts.ts`, `notice.ts`,
      `notice-words.ts`, `alert-list.tsx`.
- [ ] **Owner's home and Costs page:** "Store shortfall this month, ৳" beside Overheads (`routers/costs.ts:52`,
      `routers/home.ts:~255-280`).
- [ ] **Glossary:** widen **Stock Count**.
- [ ] **Tests:** priced at the average when counted; a late Feeding dated before the count changes the taka; told once,
      only above the line; a surplus is not told. **Prove by switching off** the told-once check.
- [ ] **Seed:** one count short by more than the line.
- [ ] **Somebody opens it:** Owner's home, digest, feed history with a ৳ column. Both languages.
