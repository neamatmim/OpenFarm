# 08 — Across every Season

**What to build:** The Owner reads one breakdown across every finished Season together, to see which livestock market, trader, breed or buying weight has returned best over the years. Ticket 05 answers that for one Season at a time.

**Blocked by:** the farm's first real Season finishing (Eid-ul-Adha 2027). Until then only the seed has finished Seasons, and a comparison of one Season against itself shows nothing. Open the page on real numbers before the build starts, and check what this ticket asks against them.

**Status:** built 2026-10-05 ahead of its block, at the Owner's word; the last check — real Seasons — waits for Eid-ul-Adha 2027

**Spec:** builds on user story 23 and "Reading it". See ticket 05 for the breakdown it widens.

- [x] **`returns.breakdownAcross({ by })`**, Owner-only and on a personal session like `returns.breakdown`. `by` is one of `livestockMarket`, `trader`, `breed` or `band`. There is no `animal`: one line per animal over every year is a list, not a comparison.
- [x] **Every finished Season**, and no Season that is still going. Each line pools its animals from all of them, using `seasonGroupsOf` and the per-line rule `returns.breakdown` already uses, so the two cannot drift apart.
- [x] **One sum:** a test asserts that the lines' costs and results across Seasons add up to the finished Seasons' totals on the page.
- [x] **Share only, never a rate a year**, as in ticket 05. Each line shows head, how many died or were lost, cost → back, and the share. A test asserts that no line has `perYear`.
- [x] **How many Seasons each line drew from**, so a trader seen once does not read like one seen every Eid. A test covers a line found in one Season beside a line found in two.
- [x] **Growth pooled** (kilos a day, Days on Feed, Cost of Gain) through `growthOfHoldings`, as ticket 05's lines already have.
- [x] **Web:** on the Fattening tab, under Finished, a "Across every Season" section with the same buttons and table as one Season's breakdown. It appears only once two Seasons have finished.
- [ ] **Somebody opens it (real Seasons — still to do after Eid 2027):** each breakdown with real Seasons, in both languages, on a desk and at phone width.

## Decided 2026-10-05

The Owner told Claude to take its recommendation on both questions.

- **Seasons only, no Ventures' cattle.** A Venture is worked in its Settlement, so leaving its animals out keeps this one sum with the finished Seasons on the page, as ticket 05's lines are. It answers what the Farm's own money did with each market, trader, breed and band. Bringing Ventures' cattle in would be a later choice on the same table, not a change to this one.
- **No minimum head and no greying out.** Each line names its head and how many Seasons it drew from, and the Owner judges how much a small line is worth. No new Farm setting.

**As built (2026-10-05):** `returns.breakdownAcross({ by })` in `routers/returns.ts`, `breakdownAcross` in
`returns-store.ts` answering `{ seasons, lines }`; the per-line rule is `linesOf`, shared with `seasonBreakdown`, so
the two cannot drift. Tests in `routers/returns-across-seasons.test.ts` (own farm: two finished Seasons and one
still going, worked by hand); the finished-only filter proved red when switched off. Web: `AcrossSeasons` in
`components/returns/season-breakdown.tsx`, its own Section on the Returns page's Fattening tab after Finished, shown
once two Seasons have finished. Opened on the seed with the rule lowered for a moment (the seed has one finished
Season): both languages on a desk. Phone width not looked at separately — it draws with the same card as a Season's
breakdown.
