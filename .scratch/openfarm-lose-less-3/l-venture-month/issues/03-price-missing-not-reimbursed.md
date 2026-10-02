# 03 — A month with a price missing is not reimbursed

**What to build:** A month whose figure — its own, or a line it carries — has feed nothing can price or a dose nothing
can cost is not reimbursed until it is priced, and the sheet says how many kilos and doses, as the Settlement already
does.

**Blocked by:** 02

**Status:** done, 2026-10-02, but for the dose test, the carried-line test and the seed look (below).

- [x] **Glossary:** **Reimbursement** — "not taken while anything its animals ate or were dosed with that month has no
      price", the Settlement's own rule brought forward a month at a time.
- [x] **Schema:** none.
- [x] **Rule:** `consumedBy` (`cost-store.ts:863`) returns the `unpricedKg` and `uncostedDoses` its `costsOf` already
      counts; 02's month-by-month function carries them per month. `reimburse` refuses where the month or any month it
      carries has either, with `{ refusal: "a_price_is_missing", unpricedKg, uncostedDoses }`. The preview
      (`consumption`, `routers/ventures.ts:3322`) returns them too.
- [x] **Refusal word:** `a_price_is_missing` exists (`correction-refusal.ts:204`); its words are the Settlement's
      ("Feed was given or a dose used that nothing can put a price on") — read them beside a month before reusing; no new
      word unless they read wrong.
- [x] **Screen:** the Reimburse sheet, before the button, says "দাম নেই: … কেজি খাবার, … ডোজ" with the numbers worded
      in Bangla, and the button waits; the new fields are defaulted for the cached answer.
- [x] **Tests** (`routers/reimbursement.test.ts`):
  - **First, red before the fix:** a month in which the Venture's pen was fed a Feed Item nobody has bought or priced —
    reimbursed today at nothing for it; refused `a_price_is_missing` with its kilos.
  - A dose of a product with no cost — refused with the count.
  - Priced afterwards (a back-dated Feed Purchase or a Fodder Price), the month goes through at the priced figure.
  - A carried line with unpriced feed holds the month that carries it.
  - **Proved by switching off** the refusal: the first test goes red.
- [ ] **Somebody opens it** (seed): a new Feed Item with no purchase fed to a Venture's pen last month; the Reimburse
      sheet for that month says the kilos are unpriced and does not offer to transfer.
- Done: `routers/price-missing.test.ts` (3) — red before (the figure said nothing of unpriced kilos); a Harvest nobody
  priced fed in January refused `a_price_is_missing` with 20 kg; priced by a back-dated purchase it goes through (the
  farm prices an item at its average once any of it has a price); and the real hole — straw nobody priced fed beside
  grass that has a price: today repaid with the straw left out, now refused with 5 kg. The refusal is asked before
  `nothing_to_reimburse`. Proved by switching it off (two tests red). `consumedBy` returns `unpricedKg`/
  `uncostedDoses`; `owedByMonth` carries them per month; `consumption` sums the month's and its carried months'.
  **Not tested:** a dose with no cost (the same count, read the same way, but a pharmacy dose needs the Vet's days) and
  a carried line with unpriced feed (it needs a round back-dated into a month already repaid). **Not opened on the
  seed:** no seed Venture month has a price missing, and making one needs a back-dated round or the Vet's sign-in,
  which signs the Owner out; the sheet's notice reuses the Settlement's words and the web typecheck and tests pass.
