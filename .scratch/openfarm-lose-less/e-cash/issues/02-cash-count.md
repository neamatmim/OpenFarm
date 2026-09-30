# 02 — The weekly Cash Count

**What to build:** The Manager counts the cash in their hand weekly, blind, against what the farm says they hold; the
Owner signs it off; a difference over the Owner's line is told to the Owner.

**Blocked by:** 01

**Status:** done, 2026-09-30.

- [x] **Glossary:** new **Cash Count**.
- [x] **Standard Playbook:** "সাপ্তাহিক নগদ গণনা / Weekly cash count" — Friday 18:00, whole farm, Manager, checked by the
      Owner, grace a day; a number (৳) and an optional note. Effect `cash_count` (once, whole-farm work, a Manager's or
      the Owner's to be assigned and recorded).
- [x] **Record:** `cash_count` (whose hand — the counter's own —, completion, counted, expected with this count left
      out, note). **The count wins**: each count's difference is added to the hand, so it holds what was counted from
      then on; a recount by a Correction compares afresh. The Step's result says only whether it differs.
- [x] **Farm Parameter** `cash_short_tell_bdt` (৳1,000), **the Owner's alone**; notice `cash_short` (digest, Owner, about
      the count, "Open the cash in hand").
- [x] **Screen:** each hand on the cash tab says when it was last counted, what was found and expected, and short/over.
- [x] **Tests:** `routers/cash-count.test.ts` (5) — blind and agreeing; the count wins and a shortfall past the line is
      told once; a Handover just before is read in, and within the line nothing is told; a recount compares afresh; the
      line is the Owner's. **Proved by switching off** the count winning, the recount's exclusion, the line and the
      Owner's gate — each red.
- [x] **Somebody opens it** (seed, 2026-09-30): published from Settings → Playbook and raised by hand; the Owner counted
      ৳2,500 against ৳3,000 with a note — the cash tab read "৳২,৫০০ · ৩০ সেপ্টেম্বর, ২০২৬ গোনা: পাওয়া গেছে ৳২,৫০০, থাকার
      কথা ৳৩,০০০ · ৳৫০০ কম", and nothing was told (under ৳1,000).

**Honest limit:** the Step is blind, but a Manager can read their own figure on the cash tab — as the store's Stock on
Hand is readable beside its count. **Also seen:** raising whole-farm work by hand asks for a Pen and shows it on the
board (pre-existing); the scheduled one is the farm's.
