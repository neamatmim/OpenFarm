# 02 — The Buying Float goes out

**What to build:** The Owner draws a **Buying Float** from a Venture Account for one Buying Trip, so the Manager goes to the haat with money that is accounted for. It leaves by bank like every other movement of a Venture's money, against the Trip it is for, and the Venture's figures move: what it has spent stops being nothing, and the balance its account should hold comes down by what went out.

A Float is refused unless the Venture is Buying, and refused beyond what its Cattle Budget is holding — the point of the two budgets is that feed money is not spent on one more bull.

**Blocked by:** None — can start immediately.

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 3, user stories 26, 53; `CONTEXT.md` — **Buying Float**, **Venture Movement**, **Venture Account**, **Cattle Budget**, **Buying Trip**.

- [x] The Owner draws a Float for one Buying Trip from one Venture, with the day and the bank reference, and it is a Venture Movement rather than a Money Event
- [x] Refused unless the Venture is Buying, and refused for more than the Cattle Budget is holding, each with a word the reader has
- [x] A Buying Trip carries at most one open Float, so two drawings for one trip cannot both be live
- [x] The Venture reads what it has spent and what its account should hold, both moved by the Float, with the Cattle Budget's share reduced
- [x] The Owner's alone, audited, from her own phone; the Manager may read what a Trip was given but may not draw it
- [x] Tests cover a Float drawn and the Venture's figures after it, both refusals, and the Manager refused the drawing

## What was built

- A **Buying Float**: money drawn from a Venture Account for one outing, by bank, as a Venture Movement
  and never a Money Event. One per outing, ever — stricter than the criterion, because a trip funded
  twice is a trip nobody can reconcile.
- Refused unless the Venture is buying, refused beyond what the Cattle Budget is holding, and refused
  for an outing already bringing another Venture's animals home.
- The Manager reads what an outing was given, and by whom, on the trip picker she uses at the haat.

## The budget arithmetic had to change

The two budgets were the balance pro-rated by the plan, which is right while money only comes in and
wrong the moment any goes out: a Float would have shrunk the Running Budget too, as though feeding the
animals got cheaper because more of them were bought. The rule now is that the plan's proportion decides
what *came in* for each budget, and after that the two are spent from separately. A Float comes off the
cattle side alone.

## What the reviews caught

- **Two refusals had no word the reader has**, so a Bangla-reading Owner would have been shown raw
  English with Latin digits. The tests now assert the words, which is how it escaped.
- **The figures would have leaked when the Float came home.** The contribution of a movement kind was
  add-only, so ticket 03's returning cash would have raised the balance while leaving the cattle side
  depressed — and the Running Budget, read as the remainder, would have quietly absorbed cattle money.
  Each budget is now read from its own side, and a kind's effect carries its direction.
- A Venture called off while the sheet was open could still be handed a Float: the state was read
  outside the lock the count takes.
- The trail of a Float did not record which outing got the money.
- The glossary still described the old pro-rata rule, and a doc comment I had written was orphaned in the
  new trip module — the same defect this repo has now caught ten times.
