# 04 — Cows giving less

**What to build:** A list on the Milk page, with a count in the Manager's home queue, of each `milking` cow whose litres
over the last D days, every Destination, fall at least P% below her own daily average over the W days before. Only
Sessions she has a record for count (missing is not zero). Not read until `cullCalfMilkDays` + W days in milk. Each row
shows both figures and Days in Milk, and opens her milk page.

**Blocked by:** 01

**Status:** done, 2026-09-30.

- [x] **Glossary:** **Lactation** widened; no new word.
- [x] **Domain `milkDropOf`** (pure, `domain/milk.ts`): litres per recorded milking over the last D **farm days before
      today** against the `MILK_USUAL_DAYS` (7) farm days before those; today left out, it is not over. Per milking,
      so an unrecorded milking is not a milking of nothing; every destination. Rounded to a tenth of a litre and a
      whole percent.
- [x] **Found while testing:** the first build read a rolling 48 hours back from now, and the 05:30 morning milking is
      23:30 the day before by the clock — so the 8th's milking fell in "the week before". Windows are farm days now; a
      domain test pins the boundary and goes red with rolling hours put back.
- [x] **Schema:** Farm Parameters `milk_drop_percent` (20) and `milk_drop_days` (2), the Manager's (decision 4); group "A
      cow giving less", its hint saying it is a convention and a heat drops milk too.
- [x] **API:** `milkDropsOn` (milk store) — cows in milk past `cullCalfMilkDays` + 7 + D days in milk;
      `milk.givingLess` (Owner, Manager, Vet); `home.manager.queue.givingLess`.
- [x] **Screens:** a "Giving less" / "দুধ কমেছে" tab on the Milk page and a group in the Manager's queue: tag, litres a
      milking lately and usually, how far under, the Pen; opening her page. (Days in milk is in the answer, not on the
      row.)
- [x] **Tests:** `milk.test.ts` (5) — named at a fifth under; late-lactation decline not named; a skipped milking not
      read as none; nothing without both parts; the farm-day boundary. `routers/giving-less.test.ts` (4) — named through
      the milking procedure; not when steady; still named with all her milk sent to Discard; the Manager's and not Barn
      Staff's. **Proved by switching off** the threshold (3 domain, 1 API red) and the farm-day windows (2 red).
- [x] **Somebody opens it** (seed, 2026-09-30): the seed's cows give steadily, so none was named; with D-0003's last two
      farm days halved in the seed's database, the Milk page's "দুধ কমেছে ১" read "D-0003 — এখন প্রতি দোহনে ৩.৪ লিটার,
      সাধারণত ৬.৬ লিটার — ৪৯% কম · দোহন পেন ১", and the Manager's home in English "3.4 L a milking, usually 6.6 L — 49%
      less".
