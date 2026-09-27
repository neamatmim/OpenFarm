# 06 — What the dairy herd returns

**What to build:** Each dairy animal's Return on Cost over her whole stay: from birth at nothing, or from a price the Owner enters for a bought or opening-herd cow. Milk counts at each month's Dispatch price, and her Sale or crossing price at the end. Calves are their own runs, shown beside their dam. While here, she counts at her kind's **Head Price**.

**Blocked by:** 04

**Status:** done

**Spec:** user stories 27–32, 35 (Dairy tab, Head Prices). See "Dairy".

- [x] **`dairy_entry_price`** and **`head_price`** tables as the spec lays them out. Migration applied to both dev databases.
- [x] **`returns.priceCow`** and **`returns.setHeadPrice`**, Owner-only, audited; `head_price_backwards` refused.
- [x] **A dairy animal's run** in `returns-store.ts`: Dairy-side shares only; milk to Bulk by month × that month's `milkPriceOf`, a month with no Dispatch at the latest earlier price (named); her end at Sale, crossing price (04) or death.
- [x] **Tests:**
  - a heifer bred here from birth;
  - a bought cow unpriced (a gap), then priced;
  - a month with milk and no Dispatch;
  - a bull calf's run ending at his crossing price and not counted in his dam's;
  - a kind with no Head Price (a gap).
- [x] **`returns.animal({ animalId })`** for her page, with her calves by `dam_id`.
- [x] **Web:** the page's Dairy tab (the herd now as a range, each animal gone with her calves beneath); the Prices tab's Head Prices and cows to price; a panel on the dairy animal's page; a column on `/culling` beside the reasons.
- [x] **The seed** gains a priced bought cow, an unpriced one, and Head Prices for four kinds of five.
- [x] **Somebody opens it:** the Dairy tab, a cow's page, `/culling`, in both languages.

## Notes from the build

- **Bred here** is born to a dam the farm wrote down (`source = born` and a `dam_id`). The opening register writes its
  herd as born with no dam; those were here before the books began and are priced by the Owner as one bought is. The
  seed prices them all, and every cow bought but one.
- **A standing animal's range** keeps her milk so far as what she has already brought back, apart from her Head Price
  as what she would fetch today; one who has cost nothing yet still counts at her Head Price (review finding).
- **A dairy run ends** at her crossing, else her Sale, else her death (a `culled` Mortality with nothing back). An
  animal cannot cross back to Dairy, so the first crossing is the only one, and a run's shares — to the day she left —
  are all Dairy-side; the side filter stays as the rule said, but nothing can reach it.
- **Gaps:** not priced, no Head Price for her kind, a crossing not priced, and milk in a month before any Dispatch had
  a price (`no_milk_price`, linking to the milk page — not in the spec, and untested). An animal can carry several.
- **Names:** the procedure is `priceCow` as the spec names it; everything else says dairy animal, not cow (the
  glossary's Animal avoids "cow"). The refusal is `bred_here_needs_no_price`.
- **Web:** the panel sits on the Money tab of any animal with a dairy run, a bull calf walked across included; the Cull
  list's column reads the Returns page's answer, asked only for the Owner.
