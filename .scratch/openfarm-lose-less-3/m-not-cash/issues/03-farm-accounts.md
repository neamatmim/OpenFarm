# 03 — The Farm Accounts, named on bKash and bank money

**What to build:** The Owner lists the Farm's own bKash numbers and bank accounts — its **Farm Accounts**. Every bKash
or bank Money Event in the Farm's purse names the Farm Account it went into or came out of, and its transaction ID or
reference; a Handover's bank end names one too.

**Blocked by:** —

**Status:** open.

- [ ] **Glossary:** new **Farm Account**; **Money Event** widened (bKash or bank names its Farm Account and its
      reference; cash still names a hand); **Handover** widened (its bank end is a named Farm Account; bKash to the bank
      is one, a Farm Account at each end); **Venture Movement** (a Venture's Sale paid by bank carries the transfer's
      reference, not her tag); **Account** gains "Not a Farm Account".
- [ ] **Schema:** `farm_account` (kind bKash or bank, the farm's name for it, the number, bank and branch for a bank,
      retired, created by and when; one per kind and number); `money_event.farm_account_id` and
      `money_event.reference`, one reference per Farm Account (partial unique index); `handover.from_account_id` and
      `handover.to_account_id`. Migration `the_farms_own_accounts`, both dev databases. **No start day:** money booked
      before names no Farm Account.
- [ ] **Rule:** decided in `bookMoney` (`money-store.ts:609`), so every record follows one rule — a Farm-purse Money
      Event by bKash or bank names a Farm Account of that kind (`names_no_farm_account`, `farm_account_not_that_kind`),
      not retired (`farm_account_retired`), and a reference (`needs_its_reference`), not used on that account before
      (`reference_used_already`). Cash names none, and a Correction to cash drops both; a Correction leaving the method
      alone keeps them; a Venture's purse names none. Asked through one input beside `paymentMethodInput`
      (`money-inputs.ts`) on every router that takes a method: `sale`, `baki`, `milk`, `money-entries` (both),
      `drugs`, `intake`, `trips`, `selling-trips`, `stock`, `money` (the Vet's fee) and `ventures` (Reimbursement, the
      Farm's share or loss, a Settlement Adjustment). `handEnd` (`routers/cash.ts:20-23`): `{ bank: true }` becomes a
      Farm Account; two different Farm Accounts may be the ends, the same one twice is `handover_goes_nowhere`. A
      Venture's Sale by bank carries its reference onto the `sale_in` in place of her tag (`sale-store.ts:128`).
      `farm.accounts.*`: list, add and retire the Owner's alone; read by anyone who writes money, the number masked
      for all but the Owner.
- [ ] **Words:** the five new refusals in `apps/web/src/lib/correction-refusal.ts`, Bangla and English.
- [ ] **Screen:** a "Farm accounts" list in Settings for the Owner (add, retire). `PaymentMethodField` widened: on
      bKash or bank it asks which Farm Account (that kind only, name and last four digits) and "Transaction ID /
      reference"; every form that uses it inherits both. The register shows the account and reference; the Hand-over
      dialog's bank end picks an account. A cached money list from before defaults both to nothing.
- [ ] **Seed:** one bKash number and one bank account listed first; the seed's bKash and bank money names them.
- [ ] **Tests:** `routers/farm-accounts.test.ts` — the Owner lists, a Manager cannot; a bKash Baki Payment keeps the
      number and the TrxID; bKash naming nothing, or the bank account, or a retired one, refused; no reference refused;
      a TrxID twice on one number refused and on another taken; cash names none, and a Correction to cash drops it; a
      deposit into the bank account and bKash to the bank as Handovers; the Vet's fee by bKash names one. **Proved by
      switching off** each of the five refusals and the same-account Handover — each red. Every existing test booking
      bKash or bank money names an account through one helper.
- [ ] **Somebody opens it** (seed): the Owner lists "অফিস বিকাশ"; a Dispatch paid by bKash asks for it and the TrxID,
      and the register reads them; a Handover from the Owner's hand into the bank account with its slip.
