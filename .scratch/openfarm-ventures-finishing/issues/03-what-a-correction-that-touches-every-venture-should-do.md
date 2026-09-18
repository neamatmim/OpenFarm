# 03 — What a Correction that touches every Venture should do

**What to build:** Some Corrections do not belong to one Venture at all. A **feed arrival's price** put right re-prices every feeding of that Feed Item the farm has ever recorded; a Herd Cost entered by hand and charged to the animals is split across every Animal on its Side; a Step Completion put right moves whatever that Step fed, weighed or dosed. Each of them can move what several Ventures were settled on at once — and today all three go through silently.

**Decided by the Owner (2026-09-18):** the farm refuses, and says which settled Ventures stand in the way, so she can raise a **Settlement Adjustment** on each and then make the change. The price stays wrong until she does, and that is the trade she has chosen: nothing moves under a figure an Investor was paid on without somebody deciding it should.

**Blocked by:** 02 (a settled Venture refuses the Corrections that name one Animal)

**Status:** ready-for-agent

- [ ] A Correction that would move what a settled Venture was settled on is refused, whichever kind it is
- [ ] The refusal names the settled Ventures it is about, so the Owner knows where to raise an Adjustment rather than having to go looking
- [ ] A Correction that touches no settled Venture goes through exactly as it does today
- [ ] The three kinds covered are a feed arrival's price, money entered by hand and charged to the animals, and a Step Completion
- [ ] Tests cover each of the three refused with a settled Venture in the way, each going through without one, and the refusal naming more than one Venture

## Checked before starting (2026-09-19)

**The ticket named the wrong mechanism, and it is corrected above.** It said a **Fodder Price** put right re-prices every feeding ever recorded. It does not. `setFodderPrice` writes `feedItem.fodderPriceBdt` and nothing else; a harvest lot's own `priceBdt` is *copied from it at the moment the lot is received* (`routers/stock.ts`, on receive). Turning the Fodder Price afterwards changes what the **next** harvest is valued at and back-fills nothing, so it cannot move a settled Venture's figures and needs no guard.

What actually re-prices feedings is correcting a **feed arrival** — `feedIn.priceBdt`, which the costing reads through the item's price history (`priceOf` → `priceHistory(movementsByItem)`). That is the `feed-arrival` Correction kind, and it is the one that belongs in this ticket.

**How to answer "which settled Ventures would this move".** Use the costing rather than a second sum, as the Settlement does: `farmCosts(tx, farmId)` carries every share with its `animalId` and its `at`, and `ownedThenByOf` says whose she was then. So for each kind the question is one filter over `costs.all.*`:

- a feed arrival → `costs.all.feed` where `feedItemId` matches the arrival's item
- money entered by hand and charged to the animals → `costs.all.herd` where `fromId` is that Money Event's id
- a Step Completion → its own `animalId` where it has one; where it does not (a Step that runs once for a Pen) the animals are the Pen's at that moment, which the feed shares for that feeding already name

Then keep the settled ones. That is a full costing load inside a Correction's transaction — acceptable for a rare human act, and it is the only way the answer agrees with what the Settlement was actually worked out from.

**`venturesOf` is already the right hook** and already returns several (ticket 02). What this ticket adds is the three implementations, and naming the Ventures in the refusal — which today says only "That Venture is settled" and carries no names.
