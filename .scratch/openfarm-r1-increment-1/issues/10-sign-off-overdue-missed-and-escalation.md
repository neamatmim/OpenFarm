# 10 — Sign-off, Overdue, Missed and Escalation

**What to build:** The Manager sees a queue of completed Instances, opens one to review every Completion and its Evidence, and approves it or sends it back with a reason; a sent-back Instance returns to the doer, who can fix or redo it. An Instance past its due time plus grace becomes Overdue and raises an in-app Alert for the Manager (and the assignee); it stays open until done or until the Manager closes it as Missed with a reason. An Overdue Instance still open after the escalation window also notifies the Owner. Nothing disappears on its own.

**Blocked by:** 08

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 1.

- [ ] The sign-off queue lists completed Instances for the checker Role; approve and send-back (with reason) transition the Instance and notify the doer in-app
- [ ] Overdue is computed from due + grace with the controllable clock; the in-app Alert appears for the Manager and assignee
- [ ] Close-as-Missed requires a reason and is Manager/Owner only; the Instance is kept with its state history
- [ ] After the escalation parameter (default 2 h) the Owner receives the Alert too; only one rung
- [ ] All transitions produce Audit Events with the role used
- [ ] Tests drive the clock through due → grace → Overdue → escalation and cover approve / send-back / redo / Missed
