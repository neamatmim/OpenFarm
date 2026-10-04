# 08 — Across every Season

**What to build:** The Owner reads one breakdown across every finished Season together, to see which livestock market, trader, breed or buying weight has returned best over the years. Ticket 05 answers that for one Season at a time.

**Blocked by:** the farm's first real Season finishing (Eid-ul-Adha 2027). Until then only the seed has finished Seasons, and a comparison of one Season against itself shows nothing. Open the page on real numbers before the build starts, and check what this ticket asks against them.

**Status:** planned 2026-10-05, not started

**Spec:** builds on user story 23 and "Reading it". See ticket 05 for the breakdown it widens.

- [ ] **`returns.breakdownAcross({ by })`**, Owner-only and on a personal session like `returns.breakdown`. `by` is one of `livestockMarket`, `trader`, `breed` or `band`. There is no `animal`: one line per animal over every year is a list, not a comparison.
- [ ] **Every finished Season**, and no Season that is still going. Each line pools its animals from all of them, using `seasonGroupsOf` and the per-line rule `returns.breakdown` already uses, so the two cannot drift apart.
- [ ] **One sum:** a test asserts that the lines' costs and results across Seasons add up to the finished Seasons' totals on the page.
- [ ] **Share only, never a rate a year**, as in ticket 05. Each line shows head, how many died or were lost, cost → back, and the share. A test asserts that no line has `perYear`.
- [ ] **How many Seasons each line drew from**, so a trader seen once does not read like one seen every Eid. A test covers a line found in one Season beside a line found in two.
- [ ] **Growth pooled** (kilos a day, Days on Feed, Cost of Gain) through `growthOfHoldings`, as ticket 05's lines already have.
- [ ] **Web:** on the Fattening tab, under Finished, a "Across every Season" section with the same buttons and table as one Season's breakdown. It appears only once two Seasons have finished.
- [ ] **Somebody opens it:** each breakdown with real Seasons, in both languages, on a desk and at phone width.

## Open before the build

- **Ventures' cattle in it or not?** A Venture's animals also come from markets and traders, but they are worked in their Settlement, not in a Season. Adding them answers "which trader is best for cattle"; leaving them out answers "which is best for the Farm's own money". Ask the Owner.
- **A minimum head per line?** A trader with two animals can top the table by luck. Either name the head count and let the Owner judge, or grey out lines under a size the Owner sets.
