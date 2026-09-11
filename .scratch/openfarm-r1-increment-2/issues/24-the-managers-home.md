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

**Review outcomes folded in.**

- **A Pen the Manager had settled read as unfinished all day.** Closing work as Missed is a decision, with a reason, and the tally counted only "completed or approved" as done — so the Pen sat at "one of two", never finished, with nothing to tap. Missed is settled now and says so.
- **The late list was the whole history of the farm.** It was fetched with no window, no limit and no ordering by lateness: a year of never-closed work, oldest queue first, shipped whole to a shed phone. A month, the longest-waiting first, and bounded — the way the Overdue screen itself reads. The herd was read in full to find the three cows under Withdrawal, too.
- **Tapping a Pen did nothing.** The link passed a Pen to a screen that takes no parameters, so it silently showed the whole farm's day. The Today screen takes a Pen now, and the link works.
- **The sign-off rows said when the work fell due**, which is the Alert's question, not this queue's. They say when it was finished — which is how long it has been waiting for the Manager.
- **The screen was empty first thing in the morning.** The day's work is raised by whoever opens the app first, and this screen did not. It does now — which is the hour it was certainly wrong before.
- **A Withdrawal that ends tomorrow is what a Manager plans around**, so the queue is soonest-first and says when each one comes off. The Alert and the SMS for it belong with Health in increment 3, which is where a Treatment sets the date in the first place.
- Also: an entry needing a decision reaches the work it is about rather than a list to search; the rows carry their own typed links rather than a union of paths and a bag of strings; a screen that cannot load says so rather than saying "loading" for ever; and there are tiles — what the day came to, and how many cows the farm is holding milk back from.

**And the shared farm again.** A digest test asserted the push said "two things". It carries everything waiting for that person, and the other test files leave their own — on the sixth run it said seventeen. Asserting the words rather than the count is the fix, and the lesson has now cost four tests across three tickets: on a farm every test shares, assert what your own work did, never what the farm adds up to.
