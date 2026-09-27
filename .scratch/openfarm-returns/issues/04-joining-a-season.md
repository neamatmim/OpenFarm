# 04 — Joining a Season

**What to build:** An animal crossing from Dairy to Fattening, or bought by the Farm from a Venture, joins a Season with a Target Window (next Eid by default). The Owner prices a crossing at her weight × a rate a kilo; until then her Season is not yet a result.

**Blocked by:** 03

**Status:** ready

**Spec:** user stories 19–22. See "Joining a Season".

- [ ] **`fattening_joining`** table as the spec lays it out. Migration applied to both dev databases.
- [ ] **The Move entry gains optional `targetWindow`** (only with `toSide: fattening`); absent, the next Eid stands in. The parity test covers an entry with it and one without. The crossing writes the joining in the Move's transaction; a Correction taking the crossing back removes it.
- [ ] **`returns.priceCrossing`**, Owner-only, audited; refuses `crossing_unweighed` with no Weigh-in on or before the day. Pricing again replaces the price; the trail keeps both.
- [ ] **Internal Sale to the Farm** takes optional `targetWindow` and writes a joining at its price; the wind-up buy-back gives all it takes one window. Selling to a Venture already ends her Season (01) — test it again with a joining.
- [ ] **Windows are read from the latest joining, else the Intake,** in `fattening-store`, `ready-store`, projected weight and the board. Test a crossed animal is suggested once her window opens (prove it by reading the Intake only and seeing it go red).
- [ ] **Seasons include joined animals** from their day, at their price; an unpriced crossing is a gap on the page and the board strip.
- [ ] **The gap test 03 could not write** (a Season can hold a valued and an unvalued animal only once a crossing waits unpriced): a Season with a bought bull and an unpriced crossing reads the bull's figure alone, the crossing named — assert the share is the bull's, not lowered by her cost. Add `not_priced` to the gap reasons, with its words and its fix (the Prices tab).
- [ ] **Web:** the crossing's Move form shows the window, next Eid first; the Internal Sale form and the buy-back ask for one when the Farm buys; the page's Prices tab lists crossings to price with a form.
- [ ] **The seed** gains a priced crossing and an unpriced one.
- [ ] **Somebody opens it:** a crossing on a phone-width screen, the Prices tab, the board strip's gap, in both languages.
