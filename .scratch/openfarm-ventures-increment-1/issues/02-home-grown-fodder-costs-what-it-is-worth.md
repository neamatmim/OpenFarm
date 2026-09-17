# 02 — Home-grown fodder costs what it is worth

**What to build:** The Owner sets a price per kilogram on a home-grown Feed Item — roughly what buying it would cost. From then on a Harvest enters the store at that price instead of at nothing, joins the weighted average like any purchase, and the animals that eat the mix are charged for it. The fields are still the Farm's, but what grows on them is no longer free to whoever eats it, so a Venture's animals can never be fed for nothing at the Farm's expense.

No money moves: a Harvest still makes no Money Event, because the Farm paid nobody. Harvests already in the store keep the nothing they came in at, and the feed report says how much fodder is still unpriced.

**Blocked by:** None — can start immediately.

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 1, user stories 37, 38, 47; [What a project is charged for](../../openfarm-investor-projects/issues/05-what-a-project-is-charged-for.md); `CONTEXT.md` — **Fodder Price**, **Harvest**, **Stock Count**.

- [x] A Feed Item carries a Fodder Price per kg, set and changed by the Owner alone and audited; a Feed Item without one behaves exactly as today
- [x] A Harvest takes the Fodder Price in force when it is recorded — from the Feed Item, never typed by the person recording it — and is an ordinary priced lot in the weighted average from then on
- [x] A Harvest still writes no Money Event, and the Farm's period report and accountant export are unchanged by one
- [x] Harvests recorded before this ships stay at no price; the feed report shows the unpriced kg rather than hiding them
- [x] A Pen fed a mix of bought feed and priced fodder is charged the blended price, and its animals' Margin moves accordingly
- [x] A Stock Count finding less than the store should hold still charges nobody — the loss stays the Farm's

## What was built

**A Feed Item carries a Fodder Price** per kg — the Owner's alone to set, from their own phone rather than a Shed Phone, and audited. A Feed Item without one behaves exactly as it did.

**A Harvest comes into the store at it**, taken from the Feed Item and never typed by whoever cut it, and from then on it is an ordinary priced lot in the weighted average. Where a cut used to dilute the store toward nothing, a hundred kilos of napier at ৳4 now puts ৳400 of grass in it, and the animals fed the mix are charged for it.

**No money moves.** A Harvest writes no Money Event, on the way in and on the way through a Correction: the farm paid nobody.

**Never retrospective.** What was cut before the farm put a price on it keeps the nothing it came in at, and the feed report still says how many kilos are unpriced.

**On the screen**: "what it is worth home-grown" in the Feed Item's row menu, shown to the Owner alone, in the same dialog the running-low level uses.

**Caught in review, and fixed:** a priced Harvest could no longer be **corrected at all** — the shape check read the farm's own valuation as a price somebody had typed, so a quantity typo would have sat in the store for good, which is the very thing that Correction exists to prevent. Its value now follows the kilos at the price the lot came in at. Also: the price could be set from a Shed Phone; the kept cache was not named again for a store line that grew a field; two doc comments were orphaned by insertion (the eighth catch in this repo); a second local refusal constant whose words no reader would ever see, now one shared constant; and the level dialog was cloned rather than shared.
