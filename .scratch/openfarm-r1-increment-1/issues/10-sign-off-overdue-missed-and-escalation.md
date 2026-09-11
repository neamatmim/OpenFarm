# 10 — Sign-off, Overdue, Missed and Escalation

**What to build:** The Manager sees a queue of completed Instances, opens one to review every Completion and its Evidence, and approves it or sends it back with a reason; a sent-back Instance returns to the doer, who can fix or redo it. An Instance past its due time plus grace becomes Overdue and raises an in-app Alert for the Manager (and the assignee); it stays open until done or until the Manager closes it as Missed with a reason. An Overdue Instance still open after the escalation window also notifies the Owner. Nothing disappears on its own.

**Blocked by:** 08

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 1.

- [x] The sign-off queue lists completed Instances for the checker Role; approve and send-back (with reason) transition the Instance and notify the doer in-app
- [x] Overdue is computed from due + grace with the controllable clock; the in-app Alert appears for the Manager and assignee
- [x] Close-as-Missed requires a reason and is Manager/Owner only; the Instance is kept with its state history
- [x] After the escalation parameter (default 2 h) the Owner receives the Alert too; only one rung
- [x] All transitions produce Audit Events with the role used
- [x] Tests drive the clock through due → grace → Overdue → escalation and cover approve / send-back / redo / Missed

**How it was built.** Overdue is not a state. Nothing runs on a timer to make work late: an Instance is Overdue when it is still open and the clock has passed its due time plus its Grace, so the farm's list is right whether or not anything swept. `today` and the Overdue list work it out on the way out.

What the sweep does raise is **Alerts** — one row per person per thing, kept until they dismiss it. The unique index on (person, kind, thing) is what lets everyone's app-open call it: the second call of the day raises nothing.

Decisions worth remembering:

- **The checker Role is pinned on the Instance**, exactly as the assigned Role already was, so the queue is a query rather than a walk through Version content — and so republishing an SOP cannot move finished work into someone else's queue (ADR 0001). The migration backfills it from the Version each open Instance was raised on.
- **An SOP with no checker Role finishes at completed.** It never enters a queue and cannot be approved; there is nobody to approve it.
- **Nobody signs off their own work**, whatever Roles they hold. The Owner may step in as checker for any Role — that is the same licence they have for claiming — but not for work that is theirs.
- **Alerts have a horizon; the Overdue list does not.** Work that went late this week is worth telling someone about; work that has been late for a month is a list, not a notification. It stays on the Overdue list until it is done or closed as Missed.
- **The sweep opens no transaction when there is nothing new to say**, and bounds itself when there is. It first reads which late Instances nobody has been told about, most recently due first — a farm with a backlog hears about this morning's milking before last week's.
- **Dismissing an Alert is audited.** That the Manager was told the milking was late, and acknowledged it, is exactly the sort of thing this system exists to be able to show afterwards.
- Send-back clears `completedAt` and returns the Instance to the doer with an Alert carrying the reason; recording a Step again corrects it rather than adding a second row, so redoing the work leaves one Completion.
