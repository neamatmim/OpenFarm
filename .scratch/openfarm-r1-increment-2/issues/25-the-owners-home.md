# 25 — The Owner's home

**What to build:** The Owner opens the app to an exception list: Overdue work, things waiting for their approval, SOP proposals, Withdrawals ending, entries that Need Review. An empty list means the farm is fine, and that is the point of it. Below the list, the tiles they actually judge the farm by — today's litres against yesterday's, work done against work raised, the herd count.

**Blocked by:** 24

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 2, user story 94.

- [ ] The exception list covers Overdue, approvals, proposals, Withdrawal ending and Needs Review, each reachable in one tap
- [ ] An empty list says so in words rather than showing an empty box
- [ ] KPI tiles below, each derived from records rather than typed anywhere
- [ ] Rows for low stock and renewal due are left for increments 6 and 7 rather than faked now
- [ ] Tests cover a farm with exceptions, a farm with none, and the tiles' arithmetic
