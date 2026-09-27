# 06 — What the dairy herd returns

**What to build:** Each dairy animal's Return on Cost over her whole stay: from birth at nothing, or from a price the Owner enters for a bought or opening-herd cow. Milk counts at each month's Dispatch price, and her Sale or crossing price at the end. Calves are their own runs, shown beside their dam. While here, she counts at her kind's **Head Price**.

**Blocked by:** 04

**Status:** ready

**Spec:** user stories 27–32, 35 (Dairy tab, Head Prices). See "Dairy".

- [ ] **`dairy_entry_price`** and **`head_price`** tables as the spec lays them out. Migration applied to both dev databases.
- [ ] **`returns.priceCow`** and **`returns.setHeadPrice`**, Owner-only, audited; `head_price_backwards` refused.
- [ ] **A dairy animal's run** in `returns-store.ts`: Dairy-side shares only; milk to Bulk by month × that month's `milkPriceOf`, a month with no Dispatch at the latest earlier price (named); her end at Sale, crossing price (04) or death.
- [ ] **Tests:**
  - a heifer bred here from birth;
  - a bought cow unpriced (a gap), then priced;
  - a month with milk and no Dispatch;
  - a bull calf's run ending at his crossing price and not counted in his dam's;
  - a kind with no Head Price (a gap).
- [ ] **`returns.animal({ animalId })`** for her page, with her calves by `dam_id`.
- [ ] **Web:** the page's Dairy tab (the herd now as a range, each animal gone with her calves beneath); the Prices tab's Head Prices and cows to price; a panel on the dairy animal's page; a column on `/culling` beside the reasons.
- [ ] **The seed** gains a priced bought cow, an unpriced one, and Head Prices for four kinds of five.
- [ ] **Somebody opens it:** the Dairy tab, a cow's page, `/culling`, in both languages.
