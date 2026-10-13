# The Owner closes a month of the Farm's own money

Until now no month was ever done. Money entered by hand could be dated any past day, the Manager could put a record
right for thirty days, and a void took money off the books whenever it came. So a monthly report already printed and
handed to the accountant could quietly stop being true. The Owner chose option A of the flow survey's E6 (2026-10-13):
**the Owner closes a month**.

## Decision

- A **Closed Month** is a month of the **Farm's own purse** that the Owner has closed. Only a month that has ended can
  be closed, and only while none of its own money still waits for her word (`month_has_money_waiting`). Closing is
  hers alone, from her own phone, and on the trail.
- **Refuse, don't hold.** In a closed month only the Owner may enter, put right, move money into or out of, or void the
  Farm's own money. Anybody else is refused with `month_closed` («এই মাস বন্ধ — মালিককে বলুন»), and the whole write
  with it: the record is not written either. The Owner chose this on 2026-10-13, over holding such changes for her
  approval (below).
- **One rule, asked of every write.** The Farm's money is written in three places and no others: `bookMoney`, where every
  record's money is booked; `putMoneyRight`, where a record carries a column or two over in place (a Vet's fee, an
  Internal Sale, a Venture's movement, an outing paid from its Float); and `takeOffTheBooks`, where a void takes it off.
  All three ask `answerToClosedMonths`. A source scan (`money-writes-guard.test.ts`) fails on a Money Event written
  anywhere else; the Owner's approval in the money router writes only who approved it and when, never a figure.
- **What touches a closed month.** The month the money stands in, and the month it would stand in, each where the purse
  is the Farm's. "Changed" means its day, amount, purse, Category, Counterparty, hand, account, way of paying or Side:
  each is a figure of the closed month too. Money written exactly as it stood changes nothing and is never refused, so
  a note or a receipt beside old money still goes through.
- **The Owner's own changes are kept and told.** Each is written to `closed_month_change` in the same transaction:
  the month, what happened (`entered`, `corrected`, `moved` into or out of it, or `voided`), what that month held of the
  money before and after, who and when. The monthly report of the month she made it in lists them under "Changed after
  closing", on screen and on the paper, in either language.
- **Closing and every money write take the Farm's one lock** (`lockTheFarm`, in `farm-lock.ts`, the one a Venture's
  money takes). `closeMonth` takes it before asking what of the month still waits; a write takes it before asking
  whether a month is closed. So money booked into a month at the moment it closes either lands first, and is counted as
  waiting, or finds it closed. Money in this month or later is never asked about: only a month that has ended can be
  closed, so the day's ordinary money reads nothing more and locks nothing. The lock is taken where a month gone by is
  first asked about, not at the start of every transaction that might reach one.
- **Reopening** is the Owner's, with a reason kept on the month and on the trail. Reopened, the month is ordinary
  again: anybody may write into it as before. Closed again, the same row says so.
- From the 7th of a month, the Owner's home names last month as ready to close while it stands open, with how much of
  it still waits for her. The 7th is a suggestion, not a rule: any ended month may be closed.

## Why not hold

The first design held a change by anybody but the Owner for her approval, and kept the closed month's figures as they
were until she said yes. That needed a parallel proposed state beside every Money Event: written by `bookMoney` and
`putMoneyRight`, read by the queue, the money book, the waiting count and the uniqueness rules, weighed again when the
change was booked a second time, taken back, written over by the Owner, approved or let go on a reopening. Three
reviews kept finding the approval state wrong in one of those paths. Refusing needs no state at all: the Manager asks
the Owner, who makes the change herself or reopens the month.

## What is not refused, and why

- **A Venture's purse.** Its figures are on its own papers, settled on their own terms. The Owner chose the Farm's
  purse only.
- **Barn records with no money**, such as milkings, feedings, weigh-ins and doses. They write no Money Event. Feedings
  carry a cost, but costs are worked out again from the whole history on every read, never stored per month, so there
  is no closed figure for a feeding to break. The money that bought the feed is a Feed Purchase, which is refused.
- **The Outbox.** No Outbox entry or step effect books money (ADR 0002, 0004): what a Shed Phone queues offline is barn
  work, never a Money Event, so nothing sent from a barn is refused late or lost.

## Consequences

- A month the Owner has closed is the month the accountant was handed, unless she changed it herself, and every such
  change is on the next paper.
- A late bill for last month, once it is closed, is the Owner's to enter, or the Manager's after she reopens it.
- Closing is one more monthly step for the Owner. It sits beside the monthly Bank Check, which comes first.
