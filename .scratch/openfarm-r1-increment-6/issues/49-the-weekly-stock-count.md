# 49 — The weekly Stock Count, and running low

**What to build:** Once a week somebody counts what is really in the store, and the count wins: any difference is booked as an adjustment with a reason — spoiled, miscounted, taken — never quietly absorbed. And each Feed Item can have a low-stock threshold, below which the farm tells the Manager, in the digest, before the concentrate runs out.

**Blocked by:** 48

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 6, user stories 74 and 75; [Feed and inventory](../../openfarm-release-1/issues/12-feed-and-inventory.md) (SOP 23); [Notification channels](../../openfarm-release-1/issues/23-notification-channels.md) (low feed stock → Manager, digest); `CONTEXT.md` — **Stock Count**, **Stock on Hand**.

- [x] A Stock Count is a Step Effect on the weekly count procedure: a counted quantity for each Feed Item the farm keeps
- [x] Each difference from Stock on Hand is booked as an adjustment with a reason, and Stock on Hand reads the count from then on
- [x] Each Feed Item may carry a low-stock threshold; falling below it puts the item on the Manager's queue and in the Manager's digest, and on the Owner's exception list — no push
- [x] A Correction to a count re-books its adjustments rather than adding more
- [x] Tests cover a count booking an adjustment with its reason, stock reading the count afterwards, the threshold raising and clearing, and a corrected count

## What was built

**A Stock Count is a Step Effect** (`stock_count`) on whatever procedure the farm counts the store with.
The test raises one by hand once a week. The Step asks nothing of its own; like a Feeding, its lines
travel beside the Evidence:

- **What the screen shows:** every Feed Item the farm keeps, with a box for what was counted and one for
  why it differs. Nothing about what the store is thought to hold, because a count that can see the
  answer copies it.
- **What it books:** for each Feed Item, what the store was thought to hold at that moment, what was
  counted, and the reason.
- **What it refuses:** a difference without a reason (`difference_needs_reason`).

A line that matches is kept, so the store reads from it, but is no adjustment. The Stock Count is the
Manager's alone (roles matrix), and a procedure that counts the store is refused at publish unless it is
assigned to the Manager.

**The count wins.** In the stock ledger a count sets what is on hand from that moment and leaves the price
alone: the farm paid what it paid. A count recorded again — a replay or a Correction — is compared against
the store without itself and replaces its own lines. Its difference is booked once, and an item left out
of the corrected count is no longer counted. The feed page lists the adjustments, with what was expected,
what was counted and why.

**Running low.** The Manager sets a threshold per Feed Item (`feed.setLowStock`), or clears it. Below it,
the item appears in three places:

- **On the Manager's queue**, and on the Owner's exception list.
- **In the Manager's digest**, through a new `low_stock` notice, never a push. It is raised by the alert
  sweep, once per item each time it runs low — the key is the item and the last day anything came in — so
  a store still low since the last notice tells nobody twice, and a lorry fed down again is a new notice.
- **Off the list without anybody clearing it**, once more comes in.

**Four tests**, in 2035:

- **A count:** its board names what to count and not the expected figure; a difference without a reason is
  refused; with one, the store reads the count, the price holds, and only the differing item is an
  adjustment.
- **After a count:** a purchase counts on from it, and a corrected count re-books its difference once.
- **Roles:** the Owner is refused.
- **Running low:** below the threshold it is on the Manager's queue and the Owner's list, told in the
  Manager's digest once however often the sweep runs, and off the queue when a lorry comes.

Mutation-checked, each red: the count not winning; no reason needed; a corrected count compared against
itself; anyone counting; low stock never clearing; the notice told twice.

## Found on the way

**A test's sweep was the cross-file flake.** The test calls the alert sweep to see the low-stock notice. On
a 2035 clock that sweep also raised overdue notices for every open piece of work on the shared farm, which
pushed the digest test's own notice out of the Manager's fifty-notice inbox. Two runs in three failed. The
sweep now runs on a clock before anything exists, where nothing is late, and four full runs pass. It is
probably what made increment 5's digest and push tests flaky once, too.

**The effect dispatch** was a chain of eleven `if`s over the effect kind. It is one table now. Its lint
complexity had passed the limit, and it was the same switch the SOP validator already keeps as a table.

## Left open

- **No schedule says "weekly".** A Trigger's schedule is times of day; the count is raised by hand. That
  is the standing Owner question about schedule cadence ("every 14 days"), recorded in increment 4.
- **What was counted on one day** sets the store from that moment, including for Feedings recorded later
  but dated before it. A Feeding written up days late, dated before the count, lowers the store below the
  count.
