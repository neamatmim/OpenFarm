# 48 — Feed comes in, and goes out

**What to build:** The Manager records feed arriving — bought from a supplier at a price, or cut from the farm's own fields at no price — and every Feeding the pens already record takes it back out. Stock on Hand is worked out from those, never typed, and each Feed Item carries a weighted-average price that the next ticket's cost allocation and the Money Events both read.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 6, user story 74; [Feed and inventory](../../openfarm-release-1/issues/12-feed-and-inventory.md); `CONTEXT.md` — **Feed Item**, **Feeding**, **Stock on Hand**, **Counterparty**.

- [ ] A Purchase records the Feed Item, quantity, price, supplier (a Counterparty found by name, as an Intake's seller is) and date; a harvest-in records the same at no price and no supplier
- [ ] Stock on Hand for each Feed Item is purchases and harvests in, minus what Feedings gave; it is derived and can go below zero, which is shown rather than refused — a Feeding is a fact about the pen
- [ ] The weighted-average price per unit is recomputed on each purchase, and a harvest at no price does not pull it towards zero for what was bought
- [ ] Quantities show in maunds alongside kg on feed purchases only, as the spec decides
- [ ] Feed stock is the Manager's to record and the Owner's to read; Barn Staff and the Vet see none of it
- [ ] Tests cover a purchase and a harvest raising stock, a Feeding lowering it, the average price, stock below zero, and the roles
