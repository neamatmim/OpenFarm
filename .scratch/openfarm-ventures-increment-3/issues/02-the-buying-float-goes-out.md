# 02 — The Buying Float goes out

**What to build:** The Owner draws a **Buying Float** from a Venture Account for one Buying Trip, so the Manager goes to the haat with money that is accounted for. It leaves by bank like every other movement of a Venture's money, against the Trip it is for, and the Venture's figures move: what it has spent stops being nothing, and the balance its account should hold comes down by what went out.

A Float is refused unless the Venture is Buying, and refused beyond what its Cattle Budget is holding — the point of the two budgets is that feed money is not spent on one more bull.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 3, user stories 26, 53; `CONTEXT.md` — **Buying Float**, **Venture Movement**, **Venture Account**, **Cattle Budget**, **Buying Trip**.

- [ ] The Owner draws a Float for one Buying Trip from one Venture, with the day and the bank reference, and it is a Venture Movement rather than a Money Event
- [ ] Refused unless the Venture is Buying, and refused for more than the Cattle Budget is holding, each with a word the reader has
- [ ] A Buying Trip carries at most one open Float, so two drawings for one trip cannot both be live
- [ ] The Venture reads what it has spent and what its account should hold, both moved by the Float, with the Cattle Budget's share reduced
- [ ] The Owner's alone, audited, from her own phone; the Manager may read what a Trip was given but may not draw it
- [ ] Tests cover a Float drawn and the Venture's figures after it, both refusals, and the Manager refused the drawing
