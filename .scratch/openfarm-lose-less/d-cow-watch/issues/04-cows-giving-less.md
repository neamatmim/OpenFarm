# 04 — Cows giving less

**What to build:** A list on the Milk page, with a count in the Manager's home queue, of each `milking` cow whose litres
over the last D days, every Destination, fall at least P% below her own daily average over the W days before. Only
Sessions she has a record for count (missing is not zero). Not read until `cullCalfMilkDays` + W days in milk. Each row
shows both figures and Days in Milk, and opens her milk page.

**Blocked by:** 01

- [ ] **Glossary:** widen **Lactation** (CONTEXT.md:143). No new word.
- [ ] **Domain `milkDropOf`** (pure, `domain/milk.ts`).
- [ ] **Schema:** Farm Parameters `milkDropPercent`, `milkDropDays`.
- [ ] **Tests:** late-lactation decline not named; milk forced to Discard under Withdrawal still counts; one skipped
      Session does not name her.
- [ ] **Somebody opens it:** both languages.
