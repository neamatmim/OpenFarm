# 03 — What a Correction that touches every Venture should do

**What to build:** Some Corrections do not belong to one Venture at all. A **feed arrival's price** put right re-prices every feeding of that Feed Item the farm has ever recorded; a Herd Cost entered by hand and charged to the animals is split across every Animal on its Side; a Step Completion put right moves whatever that Step fed, weighed or dosed. Each of them can move what several Ventures were settled on at once — and today all three go through silently.

**Decided by the Owner (2026-09-18):** the farm refuses, and says which settled Ventures stand in the way, so she can raise a **Settlement Adjustment** on each and then make the change. The price stays wrong until she does, and that is the trade she has chosen: nothing moves under a figure an Investor was paid on without somebody deciding it should.

**Blocked by:** 02 (a settled Venture refuses the Corrections that name one Animal)

**Status:** done

- [x] A Correction that would move what a settled Venture was settled on is refused, whichever kind it is
- [x] The refusal names the settled Ventures it is about, so the Owner knows where to raise an Adjustment rather than having to go looking
- [x] A Correction that touches no settled Venture goes through exactly as it does today
- [x] The three kinds covered are a feed arrival's price, money entered by hand and charged to the animals, and a Step Completion
- [x] Tests cover each of the three refused with a settled Venture in the way, each going through without one, and the refusal naming more than one Venture

## Checked before starting (2026-09-19)

**The ticket named the wrong mechanism, and it is corrected above.** It said a **Fodder Price** put right re-prices every feeding ever recorded. It does not. `setFodderPrice` writes `feedItem.fodderPriceBdt` and nothing else; a harvest lot's own `priceBdt` is *copied from it at the moment the lot is received* (`routers/stock.ts`, on receive). Turning the Fodder Price afterwards changes what the **next** harvest is valued at and back-fills nothing, so it cannot move a settled Venture's figures and needs no guard.

What actually re-prices feedings is correcting a **feed arrival** — `feedIn.priceBdt`, which the costing reads through the item's price history (`priceOf` → `priceHistory(movementsByItem)`). That is the `feed-arrival` Correction kind, and it is the one that belongs in this ticket.

**How to answer "which settled Ventures would this move".** Use the costing rather than a second sum, as the Settlement does: `farmCosts(tx, farmId)` carries every share with its `animalId` and its `at`, and `ownedThenByOf` says whose she was then. So for each kind the question is one filter over `costs.all.*`:

- a feed arrival → `costs.all.feed` where `feedItemId` matches the arrival's item
- money entered by hand and charged to the animals → `costs.all.herd` where `fromId` is that Money Event's id
- a Step Completion → its own `animalId` where it has one; where it does not (a Step that runs once for a Pen) the animals are the Pen's at that moment, which the feed shares for that feeding already name

Then keep the settled ones. That is a full costing load inside a Correction's transaction — acceptable for a rare human act, and it is the only way the answer agrees with what the Settlement was actually worked out from.

**`venturesOf` is already the right hook** and already returns several (ticket 02). What this ticket adds is the three implementations, and naming the Ventures in the refusal — which today says only "That Venture is settled" and carries no names.

## What was decided while building

**`venturesOf` is asked the changes as well as the record.** The ticket's question was "what would this Correction move", and asking only where the money *sits* answers half of it. Money entered by hand under a Category that charges nobody, moved to one that charges the animals — or moved to another month, or another Side — is money carried *into* a settled Venture's reach, and the first version let every one of those through. The hook now takes the change set, and the Herd Cost asks about where it sits and where it would land. A test moves February's spraying back to January and is refused for where it would land.

**The herd share does not say which Money Event it came from,** contrary to what this ticket assumed: `CostShare.fromId` is the *Category*, which the Reimbursement reads to itemise a month. Rather than repurpose it or widen the share, `farmCosts` now says its `history`, and the Herd Cost re-splits itself through `herdShares` for the placement being asked about. That also answered the Step Completion's harder half, so one addition served both.

**A pen-level Step asks the Pen, not the feed shares.** The ticket suggested reading a Step that runs once for a Pen off the feed shares for its feeding. The Pen's own history is the same answer and a shorter road — and it holds for a Step that weighed or dosed rather than fed, where there is no feed share to read.

**A Step reaches past its own Pen, and the first version missed it.** A review caught this and it is the one real hole the ticket's own recipe had. Feed given or counted is quantity *out* of the store, and what the next lot in is averaged over is what was standing then — so putting a Step's kilos right moves what every later feeding of that Feed Item was charged, **in whatever Pen it was eaten**. The mouths at that Step's own trough are not the whole answer: a Step in a Pen no Venture ever stood in can re-price what a settled Venture ate the morning after. A Step now asks both questions — whose the work was about, and whose ate what it moved the price of — and a test walks exactly that story, with a second lot arriving in between so the re-pricing is real rather than merely possible. Disabling only the second half turns that one test red and leaves the other nine green.

**Each reach is bounded by its own moment.** An arrival prices feedings from the day it came in; a Step's kilos move the store from the moment it was done. Both filter on `share.at >=` that moment rather than taking the Feed Item whole. The first version took the item whole to err safe, but a feeding Step happens every day: item-wide would mean that once any Venture that ever ate an item settled, no Step feeding that item could ever be put right again. The arrival's bound counts from the earlier of the day it sits on and the day the Correction would move it to, so moving an arrival back carries its reach back with it.

**The refusals are proved by being switched off.** With the three `venturesOf` hooks disabled, five of the ten tests go red; with them on, all ten pass. A guard that would pass either way proves nothing.

**Two names the reviews sent back.** `Placement` was a word CONTEXT.md bars outright (Pen Spell, _Avoid_: "placement") — it is `Spot` now, which is what its own variables already called it. And a `sideNamed` guard turned out to be dead: `changeOf` puts the schema on `to`, so a Side arrives as a Side already.

**One rule for what makes a Herd Cost.** The costing and this refusal both had to decide whether hand-entered money is charged to the animals, and they had it twice. `herdCostOf` in `cost-store.ts` is the one place now — a condition added there and not here would be a charge that moves a settled Venture's figures with nobody refused, which is the exact failure this ticket exists to prevent.

## Left as it is, on purpose

**The names reach the refusal's data, not yet a screen.** `refusal.ventureIsSettled` is still a fixed sentence in both languages, because the Ventures screens it would be read on are tickets 04 and 06. The names are on the error for those to pick up; nothing needs re-deciding when they do.

**The second, older refusal in `corrections/venture-movement.ts` is untouched.** `assertNothingRestsOnIt` throws the same word from before the hook existed and carries no names. It is a Venture Movement, which already names its own Venture to the caller, so nobody is left going looking.
