# 24 — The Manager's home

**What to build:** One screen the Manager runs the day from. At the top, their queue: what is Overdue, what is waiting for sign-off, what Needs Review, which animals are under Withdrawal. Below it, how the day is going per Pen — which Instances are done, which are open, which have not been claimed. Opening the app answers "what needs me" without navigating anywhere.

**Blocked by:** 20, 23

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 2, user story 95.

- [ ] The queue lists Overdue, sign-off, Needs Review and Withdrawal, each a link to the thing itself
- [ ] Per-Pen progress for the farm's day, from the same source of truth the Today screen uses
- [ ] It is Bangla-first and readable on a phone in a shed, like every other screen
- [ ] Nothing on it is a number without a way to reach what it counts
- [ ] Tests cover a farm mid-day, a farm with nothing outstanding, and a farm where a Pen has not been touched
