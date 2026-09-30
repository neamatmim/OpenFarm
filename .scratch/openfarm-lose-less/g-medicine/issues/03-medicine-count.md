# 03 — The monthly medicine count

**What to build:** The first Friday of each month the Manager counts each active product's doses, blind; the count
wins in Stock on Hand; a shortfall priced at the average cost per dose is told to the Owner over the Owner's line.

**Blocked by:** 01 (pharmacy doses are recorded before a count calls their absence a loss).

- [ ] **Glossary:** widen **Stock Count** to medicine, or a new word — check CONTEXT.md first.
- [ ] **Standard procedure:** monthly, first Friday (check the schedule can say "first Friday"; else the 1st), whole
      farm, Manager, Owner checks; effect `medicine_count`.
- [ ] **Record:** `medicine_count` per (completion, product), expected and counted in doses; `medicineStockOf` reads
      the latest count as the new start.
- [ ] **Told:** farm parameter for the ৳ line (Owner-only); a digest notice to the Owner.
- [ ] **Screen:** the count on the medicine page; the last count's difference per product.
- [ ] **Tests:** blind; the count wins; short told past the line, not under it.
