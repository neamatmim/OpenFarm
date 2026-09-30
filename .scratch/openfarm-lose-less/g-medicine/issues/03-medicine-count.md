# 03 — The monthly medicine count

**What to build:** The first Friday of each month the Manager counts each active product's doses, blind; the count
wins in Stock on Hand; a shortfall priced at the average cost per dose is told to the Owner over the Owner's line.

**Blocked by:** 01 (pharmacy doses are recorded before a count calls their absence a loss).

**Status:** done, 2026-10-01.

- [x] **Glossary:** new **Medicine Count** (beside **Stock Count**, not widening it: counted in doses, from the Drug
      List).
- [x] **Schedule:** a schedule trigger may now be `firstOfTheMonth` — the first of its weekdays in the month (the first
      seven days hold one of each); refused without a weekday or with `everyOtherWeek`. Domain `scheduleFallsOn`,
      `sop-content` zod, and the playbook editor (a checkbox beside "every other week", kept by `sop-draft`, worded in
      `whenWords`).
- [x] **Standard procedure:** `medicineCount` — Friday 10:00, first of the month, whole farm, Manager, Owner checks;
      effect `medicine_count` (in STEP_EFFECT_KINDS, FARM_WORK_EFFECTS, WHOSE_STEPS: the Manager's).
- [x] **Record:** `medicine_count` (completion, product, expected and counted in doses, reason); `medicine-count-store`
      books it against the book at the moment counted — bought, less given, with earlier counts' differences — every
      active product counted (`medicine_count_incomplete`), a difference needs a reason (`difference_needs_reason`),
      re-booked once on a Correction. The step carries `medicineCounts` beside the feed's `counts` through the step
      input, its Correction, the outbox and the Effect's recorded facts.
- [x] **Count wins:** `medicineStockOf` reads each product's counted difference: doses gone come off the Lot that
      expires first; `countedDifference` on the Drug List's stock, shown under the doses on hand.
- [x] **Told:** farm `medicine_short_tell_bdt` (৳1,000, the Owner's); notice `medicine_short`, digest to the Owner, the
      doses short priced at their purchases' average cost a dose.
- [x] **Screen:** the work page counts each medicine in doses with a reason box (the feed's count boxes made generic).
- [x] **Tests:** `routers/medicine-count.test.ts` (5), domain `schedule-monthly.test.ts` (2). **Proved by switching
      off** the count winning, the incomplete refusal, the reason refusal, the telling, the first-of-the-month rule
      and the Owner's line — each red.
- [x] **Somebody opens it** (seed, 2026-10-01): the procedure published and its work raised by hand; the Manager's
      work page listed all 15 medicines "(ডোজ)" with no expected figure; counted to the book with one dose short
      ("একটি ডোজ ভাঙা শিশিতে নষ্ট (সিড দেখা)"), sent through the outbox — 15 lines, one differing; the Drug List then
      read "১৩ ডোজ · গণনায় হিসাবের চেয়ে -১ ডোজ".

**Not built:** a count per Lot; the Vet is not told of a shortfall (the Owner is).
