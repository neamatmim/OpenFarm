# 02 — A Bank Check that knows it has gone stale

**What to build:** A **Bank Check** records what the farm believed a Venture Account held at a month's end. If a movement is later written or corrected into that month, the farm believes something different — but the check still says the month agreed, against a figure nobody holds any more.

A Settlement is about to refuse to close while the bank disagrees. It must not be satisfied by a month that only agreed with an answer the farm has since changed its mind about. So a check knows when the ground under it has moved, says so where the Owner will see it, and counts as a month still out until she reads the statement again.

**Blocked by:** None — can start immediately.

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 4, user story 25; story 62's list of what blocks a Settlement; `CONTEXT.md` — **Bank Check**, **Venture Account**, **Settlement**.

- [x] A Bank Check is stale when what the farm now believes that month ended on is not what the check was taken against
- [x] A stale month counts among the months still out, so nothing that waits on the bank agreeing is satisfied by it
- [x] The Venture says which months are stale and which simply disagreed, because they are different problems: one needs the statement read again, the other needs explaining
- [x] Reading the month again against the figure the farm now believes clears it
- [x] Tests cover a check that agreed then went stale, one that stays agreed while nothing moves, and a stale month read again

**Left to the Settlement (ticket 05):** a month nobody ever read cannot be stale or out, because there is no Bank Check row for it. That is deliberate — `lastCheckedMonth` is reported so a reader can tell "straight to July" from "everything is checked" — but it means a Settlement must refuse on `lastCheckedMonth` falling short of the last month that is over, as well as on `monthsOut`. The card now says "nobody has read the statement since {month}" rather than claiming straight, so the Owner is not told the account is fine when it is merely unread.
