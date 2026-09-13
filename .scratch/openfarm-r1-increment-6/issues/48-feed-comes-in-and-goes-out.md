# 48 — Feed comes in, and goes out

**What to build:** The Manager records feed arriving — bought from a supplier at a price, or cut from the farm's own fields at no price — and every Feeding the pens already record takes it back out. Stock on Hand is worked out from those, never typed, and each Feed Item carries a weighted-average price that the next ticket's cost allocation and the Money Events both read.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 6, user story 74; [Feed and inventory](../../openfarm-release-1/issues/12-feed-and-inventory.md); `CONTEXT.md` — **Feed Item**, **Feeding**, **Stock on Hand**, **Counterparty**.

- [x] A Purchase records the Feed Item, quantity, price, supplier (a Counterparty found by name, as an Intake's seller is) and date; a harvest-in records the same at no price and no supplier
- [x] Stock on Hand for each Feed Item is purchases and harvests in, minus what Feedings gave; it is derived and can go below zero, which is shown rather than refused — a Feeding is a fact about the pen
- [x] The weighted-average price per unit is recomputed on each purchase, and a harvest at no price does not pull it towards zero for what was bought
- [x] Quantities show in maunds alongside kg on feed purchases only, as the spec decides
- [x] Feed stock is the Manager's to record and the Owner's to read; Barn Staff and the Vet see none of it
- [x] Tests cover a purchase and a harvest raising stock, a Feeding lowering it, the average price, stock below zero, and the roles

## What was built

**Feed comes in as a Purchase or a Harvest** (`stock.receive`, the Manager's). A Purchase names the Feed
Item, how much in the item's own unit, what the whole lot cost, the supplier (a Counterparty found by
name, as an Intake's seller is) and the farm day it came in. A Harvest names the item, how much and the
day, and has neither a price nor a supplier. Each is refused without the other's pieces: a purchase
nobody could account for, or a harvest with money that never changed hands. Recorded in one `feed_in`
table, with the Role that recorded it.

**Stock on Hand is worked out, never stored** (`stock.onHand`, the Owner's and the Manager's). For each
Feed Item it is everything that came in less everything the Feedings gave. What was given is summed in
the database over the Feedings' own lines, so a corrected Feeding or a purchase written up late moves
it without anybody remembering to. It is shown below nothing when the pens were fed from feed nobody
wrote down arriving, and never refused.

**The weighted-average price** is everything paid divided by everything bought, over Purchases only. A
Harvest is left out rather than averaged in at nothing, so it cannot cheapen what was paid for; a Feed
Item never bought has no price. The screen shows each item's stock, price per unit, and the last day
anything came in.

**Maunds** show beside kg on the purchase form only (1 maund = 37.324 kg), because that is the one place
the farm is handed a number in maunds. **Purchase** and **Harvest** are glossary entries now, and Stock on
Hand says it is never typed.

**Four tests**, in 2034, a year no other file uses:

- **Coming in:** two purchases at different prices average to what was paid; a harvest has stock and no
  price.
- **A harvest in the same store** as bought concentrate leaves the price alone.
- **Going out:** two Feedings lower both items, and grass fed beyond what came in shows below nothing.
- **Roles and refusals:** the Owner reads and may not record; Barn Staff and the Vet are refused; a
  purchase without a price and a harvest with one are refused.

Mutation-checked, each red: Feedings ignored; harvests averaged in; stock clamped at zero; the Owner
allowed to record; a purchase without a price accepted.

## Decisions made here

- **The average is over every purchase ever made, not a moving average over what is on hand.** The spec
  says "weighted-average price recomputed on each purchase; no FIFO". A lifetime average lags a rising
  price, and ticket 53, which charges feed at the price at the time, may want a window instead. That
  is its question, with real numbers in front of it.

## Left open

- **A Purchase or Harvest cannot be corrected yet.** Ticket 51 corrects a purchase's Money Event with
  it, and needs a correction route; it belongs there.
- **Stock on Hand is not yet corrected by a Stock Count.** That is ticket 49.
