# 02 — The Running Budget runs low, and the Advance

**What to build:** The Owner sets a level, as a Farm Parameter, at which a Venture's **Running Budget** is getting thin. When it falls below that level the Venture says so where she will see it, so that putting her own money in is a decision rather than a surprise at the feed store.

Then she records an **Advance**: her own money into that Venture, interest-free, so the animals keep eating when the Running Budget has run out. It is recorded against the Venture and never as the Farm's income or expense — it is not the Farm lending at a return, it is the Owner covering a gap. It earns nothing, is never a charge against the Venture, and is repaid at cost before any capital returns, which the Settlement will do.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 4, user stories 22, 23, 24; `CONTEXT.md` — **Advance**, **Running Budget**, **Venture Movement**, **Venture Account**.

- [ ] A Farm Parameter sets the level at which a Running Budget is low, and the Owner can turn it
- [ ] A Venture whose Running Budget is below that level says so, and one above it says nothing
- [ ] The Owner records an Advance into a Venture by bank with the day and the reference: a Venture Movement, never a Money Event
- [ ] An Advance raises what the account holds and is held against the Running Budget, not the Cattle Budget — it is there to keep the animals, not to buy one more
- [ ] What a Venture owes the Owner is readable, and it is never counted among what the Venture was charged
- [ ] Refused for a Venture whose run is over, and the Owner's alone, audited
- [ ] Tests cover the warning appearing and not appearing, an Advance and the figures after it, an Advance never reaching the Farm's register or the Venture's charges, and a Role that may not
