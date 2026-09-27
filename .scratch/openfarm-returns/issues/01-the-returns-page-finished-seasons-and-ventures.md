# 01 — The Returns page: finished Seasons and Ventures

**What to build:** A Returns page under Money for the Owner. It shows each finished **Season** of the Farm's own fattening cattle and each settled **Venture**, each with its **Return on Cost** (share, average days, rate a year) and a Venture's **Return on Capital**, worked as a Settlement is, with the dead in. Seasons come from Intakes only; joinings come in 04.

**Blocked by:** —

**Status:** done

**Spec:** [the spec](../spec.md), user stories 1–13, 34 (without the Bank Rate), 35 (Fattening tab, finished), 36 and 37. See also "The arithmetic, in the domain package", "What a Season and a Venture are worked from", "The Bank Rate and the floor" (the floor only) and "Reading it".

- [ ] **In `@OpenFarm/domain`:** `returnOf`, `returnOnCapitalOf` and `seasonOf`, with unit tests: the grilling's example (21 on every 100, about 50 a year), a loss, the floor, a zero cost.
- [ ] **`farm.return_year_floor_days`** (60, 1–365) in a new "Returns" group of Farm Parameters, Owner-only, with refusal words. Migration applied to both dev databases; `LATEST_MIGRATION` moved.
- [ ] **`returns-store.ts`**: finished Seasons (from Intakes, Farm-owned animals, Fattening-side shares, back from Sale or an Internal Sale to a Venture, nothing for the dead) and settled Ventures (Return on Cost from `whatItWasCharged` and proceeds; Return on Capital from `capital_in` and `payout` movements and the Settlement's payouts).
- [ ] **`returns.page`**, Owner-only. A Manager gets FORBIDDEN.
- [ ] **Tests:**
  - a Venture-owned animal sold in the Season's window is not in it;
  - an early sale and a death are in;
  - an announced and an expected window make one Season;
  - a non-Eid window is its own;
  - a Season with an animal still standing is not listed as finished;
  - a Venture's Return on Cost and its Settlement agree on the total charged;
  - the floor, with the floor switched off going red;
  - Return on Capital counts idle capital.
- [ ] **`/returns`**, `onlyFor("owner")`, under Money after Month by month (`nav.returns`):
  - a chart of finished rates a year;
  - the Fattening tab: finished rows opening into the Return on Cost line, the working and Return on Capital with the Farm's share in taka;
  - the left-out sentence at the foot.
  - Dairy and Prices tabs show "coming" until their tickets.
- [ ] **Month by month** gains one line under the year's figures pointing to `/returns`.
- [ ] **Words in `bn` and `en`**, numbers worded in Bangla, none of the words the spec rules out.
- [ ] **The seed** gains a finished Farm Season for last Eid with one dead animal.
- [ ] **Somebody opens it:** `/returns` in both languages, as the Owner on the seed; the Month by month line; as the Manager, the menu has no entry.
