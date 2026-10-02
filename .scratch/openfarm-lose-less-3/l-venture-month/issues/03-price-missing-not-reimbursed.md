# 03 — A month with a price missing is not reimbursed

**What to build:** A month whose figure — its own, or a line it carries — has feed nothing can price or a dose nothing
can cost is not reimbursed until it is priced, and the sheet says how many kilos and doses, as the Settlement already
does.

**Blocked by:** 02

**Status:** open.

- [ ] **Glossary:** **Reimbursement** — "not taken while anything its animals ate or were dosed with that month has no
      price", the Settlement's own rule brought forward a month at a time.
- [ ] **Schema:** none.
- [ ] **Rule:** `consumedBy` (`cost-store.ts:863`) returns the `unpricedKg` and `uncostedDoses` its `costsOf` already
      counts; 02's month-by-month function carries them per month. `reimburse` refuses where the month or any month it
      carries has either, with `{ refusal: "a_price_is_missing", unpricedKg, uncostedDoses }`. The preview
      (`consumption`, `routers/ventures.ts:3322`) returns them too.
- [ ] **Refusal word:** `a_price_is_missing` exists (`correction-refusal.ts:204`); its words are the Settlement's
      ("Feed was given or a dose used that nothing can put a price on") — read them beside a month before reusing; no new
      word unless they read wrong.
- [ ] **Screen:** the Reimburse sheet, before the button, says "দাম নেই: … কেজি খাবার, … ডোজ" with the numbers worded
      in Bangla, and the button waits; the new fields are defaulted for the cached answer.
- [ ] **Tests** (`routers/reimbursement.test.ts`):
  - **First, red before the fix:** a month in which the Venture's pen was fed a Feed Item nobody has bought or priced —
    reimbursed today at nothing for it; refused `a_price_is_missing` with its kilos.
  - A dose of a product with no cost — refused with the count.
  - Priced afterwards (a back-dated Feed Purchase or a Fodder Price), the month goes through at the priced figure.
  - A carried line with unpriced feed holds the month that carries it.
  - **Proved by switching off** the refusal: the first test goes red.
- [ ] **Somebody opens it** (seed): a new Feed Item with no purchase fed to a Venture's pen last month; the Reimburse
      sheet for that month says the kilos are unpriced and does not offer to transfer.
