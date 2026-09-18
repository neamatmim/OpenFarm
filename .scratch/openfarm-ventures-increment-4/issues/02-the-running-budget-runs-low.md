# 02 — The Running Budget runs low, and the Advance

**What to build:** The Owner sets a level, as a Farm Parameter, at which a Venture's **Running Budget** is getting thin. When it falls below that level the Venture says so where she will see it, so that putting her own money in is a decision rather than a surprise at the feed store.

Then she records an **Advance**: her own money into that Venture, interest-free, so the animals keep eating when the Running Budget has run out. It is recorded against the Venture and never as the Farm's income or expense — it is not the Farm lending at a return, it is the Owner covering a gap. It earns nothing, is never a charge against the Venture, and is repaid at cost before any capital returns, which the Settlement will do.

**Blocked by:** None — can start immediately.

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 4, user stories 22, 23, 24; `CONTEXT.md` — **Advance**, **Running Budget**, **Venture Movement**, **Venture Account**.

- [x] A Farm Parameter sets the level at which a Running Budget is low, and the Owner can turn it
- [x] A Venture whose Running Budget is below that level says so, and one above it says nothing
- [x] The Owner records an Advance into a Venture by bank with the day and the reference: a Venture Movement, never a Money Event
- [x] An Advance raises what the account holds and is held against the Running Budget, not the Cattle Budget — it is there to keep the animals, not to buy one more
- [x] What a Venture owes the Owner is readable, and it is never counted among what the Venture was charged
- [x] Refused for a Venture whose run is over, and the Owner's alone, audited
- [x] Tests cover the warning appearing and not appearing, an Advance and the figures after it, an Advance never reaching the Farm's register or the Venture's charges, and a Role that may not

## What was built

- A Farm Parameter in taka: how little may be left to keep a Venture's animals with before the farm says
  so. A figure and not a proportion — the animals eat what they eat whatever the Venture raised.
- A Venture that is running and below that line says so on its card, and the button to put money in
  becomes the one that stands out.
- The **Advance**: the Owner's own money in, by bank, interest-free, landing on the Running Budget and
  not the Cattle Budget — it is there to keep the animals, not to buy one more. Never a Money Event and
  never among what the Venture was charged.
- What the Venture owes her reads on the card, and the Settlement will repay it at cost before any
  capital returns.

## The Owner chose the shape

I built the warning as a percentage of what came in for the Running Budget; both reviewers pushed back,
and the Owner chose a taka figure. It warns the same whatever size the Venture is, and it still fires for
a Venture that was never given a Running Budget at all — which a percentage cannot, having nothing to
take a percentage of.

## What the reviews caught

- **The audit trail always recorded the warning as false.** Three callers built a Venture's view without
  the level, and a defaulted parameter answered "not low" wherever anybody forgot it. The level is asked
  for now, so the compiler finds the next caller who forgets.
- **An Advance into a Venture not yet buying had no way home.** Calling a Venture off returns capital,
  and only capital; her money would have sat in the account with nothing to bring it back. Taken only
  while a Venture is running.
- **The Advance read the Venture's state outside its own write**, unlike every neighbouring path.
- Changing the new parameter recorded the new value with no old one beside it.
- The badge appeared for a Venture that is Selling while the button did not, so a card could say it was
  low and offer nothing to do about it.
- A doc comment claimed each budget was read from its own side when one is the remainder of the other,
  and the glossary promised an Advance back "before any profit is split" where the spec promises it
  before any capital returns — a weaker promise than the one the farm makes.
