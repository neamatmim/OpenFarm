# 04 — Weighed on arrival, against the slip

**What to build:** The kilos the scale shows are recorded beside what the slip said. For each seller, the farm sees how
short they run.

**Blocked by:** 03 (so ৳/kg is on the weighed kilos)

**Status:** done, 2026-09-30.

- [x] **Schema:** `feed_in.slip_quantity` (nullable), set only where the lot was weighed; `quantity` is then the
      scale's, so the store and its price per unit read the weighed kilos. Existing rows untouched. Migration
      `20260930113347_weighed_on_arrival`, both dev databases.
- [x] **API:** `stock.receive` takes an optional `weighed` (a Purchase of feed bought by the kilo only — refusal
      `weighed_needs_a_kilo_slip`); the typed figure, or bags × bag weight, or maunds, becomes the slip. A Correction of
      a weighed lot's kilos keeps the slip's bags. `arrivals` carries `slipQuantity`.
- [x] **Per seller:** `stock.onTheScale` — the last 90 farm days of weighed lots, per seller: lots, slip kg, scale kg,
      short kg, % of the slips, ৳ at what each slip kilo was charged; the most taka first (domain `sellersOnTheScale`,
      `scaleShortOf`).
- [x] **Glossary:** **Feed Purchase** widened.
- [x] **Screens:** the receiving sheet's optional "খামারের পাল্লায় ওজন (কেজি)", set against the slip as it is typed,
      with the price per kilo on the scale's kilos; under each weighed lot "রশিদে ৫০০ কেজি · ১২ কেজি কম"; the card
      "পাল্লায় কম, গত ৯০ দিন" above the lots, saying how to fill it while it is empty.
- [x] **Tests:** `feed.test.ts` (+2), `routers/weighed-on-arrival.test.ts` (5) — the scale wins in the store, bags kept
      as the slip, price on what came; no weighing, no claim; a seller's lots added up (and one over, below nothing);
      kilo only; 90 days. **Proved by switching off** the scale winning, the no-claim, the kilo rule and the window —
      each red.
- [x] **Somebody opens it** (seed, 2026-09-30): 500 kg of গমের ভুসি on the slip for ৳25,000, 488 on the scale — the
      sheet read "রশিদে ৫০০ কেজি, পাল্লায় ৪৮৮ কেজি — ১২ কেজি কম (২.৪%)" and "প্রতি কেজি ৳৫১.২৩"; saved, the card read
      "হাজী আব্দুর রশিদ ট্রেডার্স … ১২ কেজি কম (২.৪%) · ৳৬০০" (and in English). The seed now holds that lot.
