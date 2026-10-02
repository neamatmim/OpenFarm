# 01 — The Farm's Float counted home shuts its outing

**What to build:** Once the Owner has counted the Farm's own Float home, its outing takes no further Animal, no change
to an Animal's price or Hasil on it, and no change to what the outing cost — exactly as a Venture's does.

**Blocked by:** —

**Status:** done, 2026-10-02.

- [x] **Glossary:** none. **Buying Float** (CONTEXT.md:303) already says "once reconciled the outing takes no further
      Animal and no change to what it cost" of both purses; the code is brought to it.
- [x] **Schema:** none. `buying_trip.float_reconciled_at` is already written by `reconcileFarmFloat`
      (`cash-store.ts:475`).
- [x] **Rule:** `assertTripIsOpen` (`venture-store.ts:541`) refuses an outing whose own `float_reconciled_at` is set,
      as well as one with a reconciled Venture `float_out`, with the word it already uses (`float_already_reconciled`).
      One function, so Intake, the outing's cost Correction and both sides of an Intake Correction all take it at once.
      No new refusal word, so nothing new in `apps/web/src/lib/correction-refusal.ts` (the word is there, line 184).
- [x] **Screen:** `trips.list` says of each outing whether the Farm's float went on it and whether it was counted home
      (defaulted, since the web app draws a 14-day cached answer first) — built as one `countedHome`, either purse; the Intake sheet leaves out an outing counted
      home, of either purse.
- [x] **Tests** (`routers/farm-trip-float.test.ts`, beside the five there):
  - **First, red before the fix:** a Farm Float counted home, then a bull taken in on its outing — accepted today;
    refused `float_already_reconciled`.
  - Correcting the counted outing's lorry cost, and moving an Animal onto it by Intake Correction — each refused.
  - **Proved by switching off** the new read in `assertTripIsOpen`: each of the three goes red.
- [x] **Somebody opens it** (seed): the seed's counted-home Farm outing "গাবতলী হাট (সিড দেখা)" is gone from the
      Intake sheet's outings, and correcting its lorry cost on the trail says the outing has been counted.
- Done: the three tests failed before the fix (each accepted) and went red again with the new read switched off. On
  the seed, every outing is counted home, so the Intake sheet offers only "কোনো যাত্রা নয়" and "+ নতুন যাত্রা".
