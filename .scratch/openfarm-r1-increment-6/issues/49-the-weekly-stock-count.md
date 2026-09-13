# 49 — The weekly Stock Count, and running low

**What to build:** Once a week somebody counts what is really in the store, and the count wins: any difference is booked as an adjustment with a reason — spoiled, miscounted, taken — never quietly absorbed. And each Feed Item can have a low-stock threshold, below which the farm tells the Manager, in the digest, before the concentrate runs out.

**Blocked by:** 48

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 6, user stories 74 and 75; [Feed and inventory](../../openfarm-release-1/issues/12-feed-and-inventory.md) (SOP 23); [Notification channels](../../openfarm-release-1/issues/23-notification-channels.md) (low feed stock → Manager, digest); `CONTEXT.md` — **Stock Count**, **Stock on Hand**.

- [ ] A Stock Count is a Step Effect on the weekly count procedure: a counted quantity for each Feed Item the farm keeps
- [ ] Each difference from Stock on Hand is booked as an adjustment with a reason, and Stock on Hand reads the count from then on
- [ ] Each Feed Item may carry a low-stock threshold; falling below it puts the item on the Manager's queue and in the Manager's digest, and on the Owner's exception list — no push
- [ ] A Correction to a count re-books its adjustments rather than adding more
- [ ] Tests cover a count booking an adjustment with its reason, stock reading the count afterwards, the threshold raising and clearing, and a corrected count
