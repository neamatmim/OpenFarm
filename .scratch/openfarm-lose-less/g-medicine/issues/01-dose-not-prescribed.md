# 01 — A dose not prescribed, and its Withdrawal

**What to build:** The Manager or Owner records a dose bought from a pharmacy — animal, product, the time, who advised
it — as a **Treatment** without a Prescription. It takes its doses from stock, is costed like any dose, and starts her
Withdrawal through `recomputeWithdrawal`.

**Blocked by:** —

**Status:** done, 2026-09-30.

- [x] **Glossary:** **Treatment** widened (a third way it reaches her); **Drug List** points at the new
      **Default Withdrawal Days**.
- [x] **Record:** `treatments.giveNotPrescribed` (Owner/Manager, personal session, audited `treatment`): a `treatment`
      row with no `prescription_id` and no `instance_id` (now nullable; the relation no longer says it is always
      there), `advice` (who advised and why). Stock and costing read every given Treatment, so it is taken and costed
      with no change. Refused: `given_in_the_future`, `product_retired`, `she_is_gone`.
- [x] **Unknown days:** `farm.default_milk/meat_withdrawal_days`, the Vet's alone (`drugs.setDefaultDays`; read by
      `drugs.defaultDays`, open to a visiting Vet beside the Drug List). Domain `daysOfADoseNotPrescribed`: the dose
      keeps the default for each day its product lacks, so a later default does not change it; the product's own days,
      once the Vet writes them, win. None written → refused `ask_the_vet_for_days`.
- [x] **Told:** `dose_not_prescribed`, immediate to the Vet, raised and pushed by the sweep
      (`dose-not-prescribed-store.ts` `dosesToTell`/`tellOfDoses`), keyed on the dose; links to her page by its tag.
- [x] **Screen:** "প্রেসক্রিপশন ছাড়া ওষুধ" in her page's menu (Owner/Manager, still here): the medicine, when (empty
      is now), why and who advised; it says what it will hold her for, or "ask the Vet". The Drug List shows the
      default days to all, with the Vet's button to write them.
- [x] **Register:** the treatment register (R4) shows the advice as why it was given and the clear-on dates from the
      dose's own days.
- [x] **Tests:** `routers/dose-not-prescribed.test.ts` (7) and domain `health.test.ts` (3). **Proved by switching
      off** the recompute, the default fallback, the ask-the-Vet refusal, the future refusal, the sweep, the Role gate
      and both register fallbacks — each red.
- [x] **Somebody opens it** (seed, 2026-09-30): D-0006 given অক্সিটেট্রাসাইক্লিন ২০% "জ্বর, ফার্মেসির পরামর্শে"; the
      dialog read "দুধ ৭ দিন আর মাংস ২৮ দিন আটকে থাকবে।", her page then showed milk held to 7 Oct and meat to 28 Oct, and
      the sweep told ডা. সালমা আক্তার. The Drug List shows "এখনো লেখা হয়নি" for the default.
- [x] **Go-live sheet:** `vet-withdrawal-sheet.html` asks the Vet for the default days in a table of their own.

**Not built:** correcting a dose not prescribed (a wrong medicine or animal is not yet put right); the medicine count
(03) is what will show a pharmacy dose nobody wrote.
