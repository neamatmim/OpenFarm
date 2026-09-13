# 49 — The weekly Stock Count, and running low

**What to build:** Once a week somebody counts what is really in the store, and the count wins: any difference is booked as an adjustment with a reason — spoiled, miscounted, taken — never quietly absorbed. And each Feed Item can have a low-stock threshold, below which the farm tells the Manager, in the digest, before the concentrate runs out.

**Blocked by:** 48

**Status:** done

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
- **What it refuses:** a count that leaves out a Feed Item the farm keeps (`count_incomplete`), a retired
  Feed Item, and a difference without a reason (`difference_needs_reason`). Both refusals name every
  item concerned, so a count synced days later can be put right in one go.

A line that matches is kept, so the store reads from it, but is no adjustment. The Stock Count is the
Manager's alone (roles matrix), and a procedure that counts the store is refused at publish unless it is
assigned to the Manager.

**The count wins.** In the stock ledger a count sets what is on hand from that moment and leaves the price
alone: the farm paid what it paid. A count recorded again — a replay or a Correction — is compared against
the store without itself and replaces its own lines. Its difference is booked once, and an item left out
of the corrected count is no longer counted. **Adjustments are read as they stand now.** The feed page lists them with what the store was thought to
hold at the moment of the count — worked out again, so a Feeding or delivery written up late but dated
before the count shows in it rather than standing as a loss — beside what was expected when the count was
made, what was counted, why, and who counted.

**Running low.** The Manager sets a threshold per Feed Item (`feed.setLowStock`), or clears it. Below it,
the item appears in three places:

- **On the Manager's queue**, and on the Owner's exception list.
- **In the Manager's digest**, through a new `low_stock` notice, never a push. It is raised by the alert
  sweep, once per item each time it falls below the level — the key is the item and the moment it last
  fell below. A store still low since the last notice tells nobody twice; one lifted back up by a lorry or
  by a count that found more, and then fed down again, is a new notice. A farm with no Manager is told
  nothing and opens no transaction.
- **Off the list without anybody clearing it**, once more comes in.

**Five tests**, in 2035:

- **A count:** its board names what to count and not the expected figure; a count leaving an item out is
  refused; a difference without a reason is refused, naming it; with one, the store reads the count, the
  price holds, and only the differing item is an adjustment, with who counted.
- **A late entry:** a harvest dated before the count, recorded after it, changes the adjustment's
  difference and leaves the store reading the count.
- **After a count:** a purchase counts on from it, and a corrected count re-books its difference once.
- **Roles:** the Owner is refused.
- **Running low:** below the level it is on the Manager's queue and the Owner's list, and told in the
  Manager's digest once however often the sweep runs. Counted back above and then below, it is told
  again; off the queue when a lorry comes.

Mutation-checked, each red: the count not winning; no reason needed; a corrected count compared against
itself; anyone counting; low stock never clearing; the notice told twice; a partial count accepted;
adjustments frozen at count time; the notice keyed once per item.

## Found on the way

**A test's sweep was the cross-file flake.** The test calls the alert sweep to see the low-stock notice. On
a 2035 clock that sweep also raised overdue notices for every open piece of work on the shared farm, which
pushed the digest test's own notice out of the Manager's fifty-notice inbox. Two runs in three failed. The
sweep now runs on a clock before anything exists, where nothing is late, and four full runs pass. It is
probably what made increment 5's digest and push tests flaky once, too.

**The effect dispatch** was a chain of eleven `if`s over the effect kind. It is one table now. Its lint
complexity had passed the limit, and it was the same switch the SOP validator already keeps as a table.

## What the review changed

The spec axis:

- **A late Feeding was absorbed.** An adjustment's expected figure was frozen when the count was saved, so
  feed that was fed, written up late and dated before the count stood in the adjustments as a loss. The
  adjustments are read against the store as it now stands, with the figure at count time kept beside.
  My own "Left open" note had the consequence backwards, too: the store reads the count either way.
- **A count could leave a Feed Item out** — or count nothing — and the API took it; only the screen
  required every item. The API requires every live item, and refuses retired ones.
- **A second low-stock notice could be lost.** The notice was keyed on the last arrival, so an item counted
  back above its level and fed down again was never told about twice. It is keyed on the moment it last
  fell below.
- **Who counted** was stored and never shown. It is on the adjustments now.

The standards axis:

- **An orphaned doc comment** on the work screen.
- **A "third half"** of the alert sweep.
- **No glossary word** for running low (added), and a level called both threshold and `lowStockAt`.
- **A sweep on a farm with no Manager** that opened a transaction every time.
- **A tolerance comment** that did not match the rounding.
- **`runningLow` rebuilding the whole store's history** on every home load, even on a farm that watches
  nothing. It asks first now.
- **Smaller:** duplicated rounding, an unused export and return, the feed page recomputing the low rule
  and looking up names the API could send, a level input accepting 0, and copy dropped into the wrong
  block.

**A second cross-file dependency turned up in the full runs.** Counting every Feed Item on a shared farm
means this test counts other files' items too, and whether one of them is below zero depends on which
file ran first. Two runs in five failed. The test counts such an item at nothing, with a reason, and a
Correction repeats what the count said about everything else; five runs in a row pass.

## Left open

- **No schedule says "weekly".** A Trigger's schedule is times of day; the count is raised by hand. That
  is the standing Owner question about schedule cadence ("every 14 days"), recorded in increment 4.
- **A reason is free text**, not a choice between spoilage and a count error. The feed decision gives
  those as examples; losses cannot be summed by cause until the farm decides the list.
- **The blind count cannot say which items need a reason** until it is refused. The refusal names them.
- **Counting every Feed Item on the farm** includes ones kept for another shed's store, if the farm ever
  has two stores. It has one.
