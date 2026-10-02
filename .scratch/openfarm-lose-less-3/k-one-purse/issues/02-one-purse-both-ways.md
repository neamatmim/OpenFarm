# 02 — One purse to an outing, both ways

**What to build:** A Venture's Float is refused for an outing already bringing the Farm's own animals home, and a
Venture's animal is refused on an outing the Farm's Float paid for — at Intake, and on any Intake Correction that
changes her owner **or her outing**.

**Blocked by:** 01

**Status:** done, 2026-10-02.

- [x] **Glossary:** **Buying Float** — "Every Animal on a funded outing belongs to the Venture that funded it" widened
      to whichever purse funded it, the Farm's included; nothing new.
- [x] **Schema:** none.
- [x] **Rule — the Float:** `drawFloat` (`routers/ventures.ts:1812`) refuses an outing carrying any animal that is not
      this Venture's, the Farm's included. A new word, `trip_is_the_farms` ("That outing is bringing the Farm's own
      animals home"), where the animal is the Farm's; another Venture's keeps `trip_is_another_ventures`. **Left:**
      still asked before the write, as the other-Venture check was — moving both behind the farm lock is its own change.
- [x] **Rule — the animal:** `assertSheBelongsWithTheFloat` (`intake-store.ts:192`) reads the Farm's float too (a
      Handover with `float` "out" naming the outing): on a Farm-floated outing she must be the Farm's, refused
      `not_whose_float_bought_her` otherwise — its words already say "another purse's money".
- [x] **Rule — the Correction:** `corrections/intake.ts` asks it whenever the owner **or** the outing changes, with the
      owner and the outing she will have after it (today only inside `to.owner !== undefined`, line 181).
- [x] **Refusal words:** `trip_is_the_farms` in `apps/web/src/lib/correction-refusal.ts`, with `refusal.tripIsTheFarms`
      in both message files; the Bangla says it without numerals.
- [x] **Screen:** the Intake sheet names a Farm-floated outing ("খামারের টাকায়") and, on one, says she is the Farm's —
      whose she is stops being a choice, as it already does on a Venture's (`intake-sections.tsx:296-301`). The new
      `trips.list` field is defaulted for the cached answer.
- [x] **Tests** (`routers/float.test.ts` has the funded Venture to draw with):
  - **First, red before the fix:** an outing with one of the Farm's bulls on it, then a Venture's Float drawn for it —
    accepted today, and the outing's lorry moved into the Venture's purse; refused `trip_is_the_farms`, the lorry left
    in the Farm's.
  - **Red before the fix:** a Farm Float handed for an outing, then a Venture's bull taken in on it — accepted today;
    refused `not_whose_float_bought_her`.
  - **Red before the fix:** a Farm bull on an un-floated outing moved by an outing-only Intake Correction onto a
    Venture-floated outing — accepted today; refused.
  - An owner Correction making a Farm-floated outing's bull a Venture's — refused.
  - **Proved by switching off** each of the three checks (the Farm in `drawFloat`, the Farm's Handover in
    `assertSheBelongsWithTheFloat`, the outing-only Correction): its test goes red.
- [x] **Somebody opens it** (seed): a new outing floated from the Owner's hand to the Manager in the browser — the
      Intake sheet shows "খামারের টাকায়" and offers no Venture; one of the Farm's bulls taken in on another outing, then
      the Owner's Float sheet for it comes back with the Farm's-animals refusal in Bangla.
- Done: `routers/one-purse.test.ts` (4) — each failed before the fix (accepted); each of the three checks switched off
  turned its own test red. `trips.list` says `farmFloat`. Also fixed on the way: an Intake Correction moving her off
  an outing (to none) checked the outing she was leaving (`to.buyingTrip ?? row.buyingTripId`). Seed: "খামারের টাকার
  যাচাই হাট" floated ৳50,000 from the Owner's hand reads "· খামারের টাকায়", turns a chosen Venture back to the Farm
  and locks it; a Farm bull F-0063 on "মিশ্র পার্স যাচাই হাট" refuses a Venture's Float `trip_is_the_farms`.
