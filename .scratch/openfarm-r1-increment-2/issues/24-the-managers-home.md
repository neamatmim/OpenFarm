# 24 — The Manager's home

**What to build:** One screen the Manager runs the day from. At the top, their queue: what is Overdue, what is waiting for sign-off, what Needs Review, which animals are under Withdrawal. Below it, how the day is going per Pen — which Instances are done, which are open, which have not been claimed. Opening the app answers "what needs me" without navigating anywhere.

**Blocked by:** 20, 23

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 2, user story 95.

- [x] The queue lists Overdue, sign-off, Needs Review and Withdrawal, each a link to the thing itself
- [x] Per-Pen progress for the farm's day, from the same source of truth the Today screen uses
- [x] It is Bangla-first and readable on a phone in a shed, like every other screen
- [x] Nothing on it is a number without a way to reach what it counts
- [x] Tests cover a farm mid-day, a farm with nothing outstanding, and a farm where a Pen has not been touched

**How it was built.**

- **Every number is a link.** A count with no way to reach what it counts is a number people stop believing, and a home screen full of those is a home screen nobody opens. Late work and work waiting for sign-off open the work itself; an entry needing a decision opens the queue it is in; a cow under Withdrawal opens her page.
- **A heading with nothing under it is furniture**, so an empty queue is not drawn at all — and when every queue is empty the screen says so in words rather than leaving a blank space that might be a bug.
- **A Pen nobody has been to is on the screen saying so.** The obvious reading — "show the Pens with work done" — makes the Pen that has been forgotten disappear from the only screen that would have caught it. Every Pen with work raised today is listed, done or not, with the animals standing in it.
- **The day's work comes from the same query the Today screen reads**, so the Manager's screen and the milker's cannot disagree about what was raised.

**A flake caught before it was committed.** The first tests asserted a Pen had exactly two pieces of work raised. It does have two of *this* round — but a Pen's day is every SOP that concerns it, and the other test files share this farm and author their own, so the total depended on which files had run. The assertions are about this round's work now. That is the third time this farm's shared state has taught the same lesson, and the first time it was caught before the commit rather than by a rerun.

**What it does not do yet.** The Owner's exception list is ticket 25 — proposals waiting, and the tiles the farm is judged by. The two notification rows this screen's queues imply (an SOP proposal waiting for the Owner, work reassigned to its new assignee) belong with it.
