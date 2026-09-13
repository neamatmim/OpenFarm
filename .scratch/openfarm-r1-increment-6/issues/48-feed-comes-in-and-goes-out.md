# 48 — Feed comes in, and goes out

**What to build:** The Manager records feed arriving — bought from a supplier at a price, or cut from the farm's own fields at no price — and every Feeding the pens already record takes it back out. Stock on Hand is worked out from those, never typed, and each Feed Item carries a weighted-average price that the next ticket's cost allocation and the Money Events both read.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 6, user story 74; [Feed and inventory](../../openfarm-release-1/issues/12-feed-and-inventory.md); `CONTEXT.md` — **Feed Item**, **Feeding**, **Stock on Hand**, **Counterparty**.

- [x] A Purchase records the Feed Item, quantity, price, supplier (a Counterparty found by name, as an Intake's seller is) and date; a harvest-in records the same at no price and no supplier
- [x] Stock on Hand for each Feed Item is purchases and harvests in, minus what Feedings gave; it is derived and can go below zero, which is shown rather than refused — a Feeding is a fact about the pen
- [x] The weighted-average price per unit is recomputed on each purchase over what is in the store; a harvest adds feed at no cost, so what the pens are charged, over time, is what the farm paid *(reworded in review — see below)*
- [x] Quantities show in maunds alongside kg on feed purchases only, as the spec decides
- [x] Feed stock is the Manager's to record and the Owner's to read; Barn Staff and the Vet see none of it
- [x] Tests cover a purchase and a harvest raising stock, a Feeding lowering it, the average price, stock below zero, and the roles

## What was built

**Feed comes in as a Feed Purchase or a Harvest** (`stock.receive`, the Manager's):

- **A Feed Purchase** names the Feed Item, how much in the item's own unit, what the whole lot cost, the
  seller (a Counterparty found by name, called the seller as on an Intake) and the farm day it came in.
- **A Harvest** names the item, how much and the day, with neither a price nor a seller.

The screen gives each entry an id, so a second tap on the same form is the same lorry and not a second
one. It refuses:

- a purchase without its price or seller, and a harvest with either
- a day that has not come yet
- a retired Feed Item
- less than a tenth of the item's unit

**What came in can be read** (`stock.arrivals`, the Owner's and Manager's): newest first, with the
seller, the price, and maunds beside the kilos for feed weighed in kg. **It can be put right**
(`stock.correct`) — quantity, price, seller or day — as a Correction with a reason, inside the Role's
window, so 5000 kg typed for 500 does not sit in the store and its price for good.

**Stock on Hand is worked out, never stored** (`stock.onHand`): everything that came in less everything
the Feedings gave, read from the Feedings' own lines. A corrected Feeding or a purchase written up late
moves it without anybody remembering to. It is shown below nothing when the pens were fed from feed
nobody wrote down arriving, and never refused.

**The price is a moving weighted average**, recomputed on each purchase over what is in the store, and
replayed in the order things happened:

- **A Feed Purchase** adds its quantity and its cost.
- **A Harvest** adds its quantity at no cost.
- **A Feeding** takes feed out at the price of the moment.

What the pens are charged, over time, is what the farm paid. The domain's `stockLedger` reads the store
as of any moment, which is what ticket 53 charges a Feeding at. **Feed Purchase** and **Harvest** are
glossary entries.

**Six tests**, in 2034, a year no other file uses:

- **Coming in:** two purchases at different prices, and a harvest with stock and no price.
- **A harvest in the same store** as bought concentrate lowers the price to what was really paid for all
  of it.
- **Going out:** Feedings lower stock, grass fed beyond what came in shows below nothing, and the price
  holds.
- **A new, dearer purchase** averages with what is still in the store, not with everything ever bought;
  a second tap records nothing more.
- **A lot typed ten times too big**, corrected, with the store, the price and the list following.
- **Roles and refusals:** by their words, including the future day and the retired feed.

Mutation-checked, each red: Feedings ignored; a harvest averaged in at the bought price; stock clamped at
zero; the Owner allowed to record; a purchase without a price accepted; Feedings not lowering the value;
a harvest left out of the price; no double-tap protection; a retired feed accepted; a correction ignoring
the quantity.

## What the review changed

**The price was wrong in two ways**, and the spec axis found both:

- **It was a lifetime average** of every purchase, not "recomputed on each purchase". Concentrate at
  ৳40 for eleven months and ৳60 now read about ৳42.
- **A harvest mixed into a bought store was left out**, so free maize would have been charged at the
  bought price. That was my own criterion, and it contradicted the feed decision taken with the Owner
  ("zero-price fodder contributes zero cost") and ticket 53. The decision wins, and the criterion is
  reworded.

**Also from the spec axis:**

- **Nobody could read what came in.** It can now be read, with maunds, which otherwise showed only while
  typing.
- **A purchase could not be corrected.** It can now.
- **A retired Feed Item took purchases through the API** while the screen hid it. It is refused.

**The standards axis:**

- **A double tap recorded two lorries.** An entry id now makes the second a no-op.
- **A day built by hand in the web page** — now the farm clock's own helper.
- **A refusal with no word.**
- **"Supplier"**, a third name for a Counterparty beside the glossary's seller and buyer.
- **A Purchase glossary entry** that clashed with Intake's "Purchase (finance's word)" — now **Feed
  Purchase**.
- **A purchase of 0.04 kg** stored as nothing.
- **A stale comment** promising stock "in increment 6".
- **Arrivals filtered once per item** — now grouped once.
- **Copy split across the feed block.**

## Left open

- **Stock on Hand is not yet corrected by a Stock Count.** That is ticket 49.
- **A Feeding's line is still named `givenKg`** though it is in the Feed Item's own unit — bales, litres.
  Renaming it touches the stored Feedings and belongs in its own change.
- **1 maund = 37.324 kg**, the standard. If the farm's traders use a 40 kg mon, it is one constant.
