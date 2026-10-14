# The Owner closes a month of the Farm's own money

Until now no month was ever done. Money entered by hand could be dated any past day, the Manager could put a record
right for thirty days, and a void took money off the books whenever it came. So a monthly report already printed and
handed to the accountant could quietly stop being true. The Owner chose option A of the flow survey's E6 (2026-10-13):
**the Owner closes a month**.

## Decision

- A **Closed Month** is a month of the **Farm's own purse** that the Owner has closed. Only a month that has ended can
  be closed, and only while none of its own money still waits for her word (`month_has_money_waiting`). Closing is
  hers alone, from her own phone, and on the trail.
- **Refuse, don't hold.** In a closed month only the Owner may enter, put right, move into or out of, or void the
  Farm's own money, or the other records its figures are read from (below). Anybody else is refused with
  `month_closed` («এই মাস বন্ধ — মালিককে বলুন»), and the whole write with it: the record is not written either. The
  Owner chose this on 2026-10-13, over holding such changes for her approval (below).
- **One rule, asked of every write.** `answerToClosedMonths` weighs each change, as it stood and as it will stand, and
  asks once for every month the write touches. The Farm's money is written in the money store and nowhere else:
  `bookMoney`, where every record's money is booked; `putMoneyRight`, where a record carries a column or two over in
  place (a Vet's fee, an Internal Sale, a Venture's movement, an outing paid from its Float); `takeOffTheBooks`, where
  a void takes it off; and the Owner's approval (`approveMoney`), which writes only who approved it and when, never a
  figure. A source scan (`money-writes-guard.test.ts`) fails on a Money Event, Handover, Cash Count, Write-off or Bank
  Check written anywhere else — by its own name, a name it was imported as, a schema prefix or raw SQL — and on an
  approval that writes more than who and when.
- **What touches a closed month.** The month the record stands in, and the month it would stand in, each where the
  purse is the Farm's. For money, "changed" means its day, amount, purse, Category, Counterparty, hand, account, way of
  paying or Side: each is a figure of the closed month too. A record written exactly as it stood changes nothing and
  is never refused, so a note or a receipt beside old money still goes through.
- **The Owner's own changes are kept and told.** Each is written to `closed_month_change` in the same transaction:
  the month, what happened (`entered`, `corrected`, `moved` into or out of it, or `voided`), what that month held of the
  record before and after, what the record was — a Sale's money, a Handover, a Write-off — whom it was with, the tag of
  the Animal it was for, who changed it and when. The monthly report of the month she made it in lists them under
  "Changed after closing": on screen, with the way to the record where a page shows it; on the paper; and in the
  accountant's CSV, a row each, with what the month held before and after in columns of their own.
- **The Farm's one lock comes first, and only where money can be.** A write that can book or move money, or another
  figure of a month gone by, takes `lockTheFarm` (in `farm-lock.ts`) at its start, before any row of its own:
  - the direct writers of money, each an audited write marked `reachesMoney` — money entered by hand and wages, Wage
    Draws, Sales, Dispatches, Intakes, buying and selling outings, Medicine Purchases, a Vet's fee, Receivable paid and
    written off, Handovers and counting a Float home, a Bank Check, a lost animal's money made good, and work held for
    a person taken in from Needs Review — and the stores that open their own transactions for feed purchases, supplier
    payments and the wage run, and every write of a Venture's money, which always have;
  - a Correction of a kind marked `money`, or, for a Step, one whose Effect counts the cash;
  - a sync batch only where one of its entries was made in a month gone by.
    `closeMonth` takes it before asking what of the month still waits. So money booked into a month at the moment it
    closes either lands first, and is counted as waiting, or finds it closed; and no two such writes take the Farm and a
    row in opposite orders. Asking about a closed month takes the lock again, which in the same transaction is already
    held, and takes it there only where a path above was missed. Everything else — a milking, an observation, the day's
    sync, the register — never takes it, and never waits on it: the lock is `for no key update`, so a row that only names
    the Farm is written beside it freely.
- **A Correction a phone held asks as the farm stands now.** It is judged at when it was made, as every held
  Correction is; but whether its month is closed is asked by the farm's clock when the farm hears of it (`heardAt`), so
  a month closed since is closed to it, and it is kept as a late entry for a person.
- **Reopening** is the Owner's, with a reason kept on the month and on the trail. Reopened, the month is ordinary
  again: anybody may write into it as before. Closed again, the same row says so.
- From the 7th of a month, the Owner's home names last month as ready to close while it stands open, with how much of
  it still waits for her. The 7th is a suggestion, not a rule: any ended month may be closed.
- **An outing paid from its Float** moves the one Money Event it found into the Venture's purse, by its id, and the
  trail says that one moved: only that one moves, so the trail says all that moved.

## What a closed month's figures are read from

Each is decided, and each is either covered by the rule or said here as not a closed month's figure, with why.

- **Money Events** — covered, as above.
- **Handovers** — covered. A Handover's day is when the notes moved, and a hand's cash at a month's end is read from
  them: one written or voided into a closed month is the Owner's alone (`writeHandover`, `takeHandoverAway`), and hers
  is listed by the hand it went into.
- **Receivable written off** — covered. A Write-off lowers what its Sale or Dispatch fetched, so it falls in that one's
  month, whenever it is written: dated by the day she was sold or the milk sent, by its own record, as a Sale left
  wholly on credit books no money to date it by; a Sale is the purse of whoever owned her that day. Writing off is the
  Owner's alone already; hers into a closed month, or put right, is listed by the buyer and, for a Sale, her tag
  (`answerForWriteOff`).
- **Cash Counts** — covered. A count sets what a hand holds, and its difference is the month's: what was counted, when,
  and whose hand. A count dated into a closed month by anybody but the Owner is refused; one a phone held past the
  month's end comes in as a late entry, kept for a person to see to and never lost (ADR 0002). Hers, or one she puts
  right, is listed by the counter.

- **Bank Checks** — covered. A Farm Account's first reading sets what it held. Reading a statement is the Owner's alone
  already; hers of a closed month is listed by the account.
- **A Venture's movements** — not a closed month's figure, but where the Farm's own capital goes into or comes back from
  a Venture, which is a Money Event of the Farm's and covered. The rest is the Venture's own purse.
- **Barn records and the Owner's prices** — milkings, feedings, doses, weigh-ins, calvings, moves, and the price she
  sets on a cow joining the dairy. A month's charges, Side Results and Capital Employed are worked out again from the
  whole history on every read, so one of these written late does move a closed month's charges and capital. They are
  not refused: barn work comes off a Shed Phone's Outbox, which must never lose it (ADR 0002, 0004), and is dated when
  the work was done, so it lands late only when a phone was out of signal across the month's end; the prices are the
  Owner's alone already. This is a known limit: a closed month's money, cash, accounts and Receivable stand as closed,
  and its charges and capital can still move with a late barn record. A Feed or Medicine Purchase, the money that
  bought what was fed, is a Money Event and covered.

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
- **Barn records and the Owner's prices**, as above.
- **The Outbox, except a Cash Count.** No other Outbox entry or step effect books money or writes a figure the rule
  covers (ADR 0002, 0004): what a Shed Phone queues offline is barn work. A Cash Count it held into a closed month is
  kept as a late entry, never lost.

## Consequences

- A month the Owner has closed is the month the accountant was handed, unless she changed it herself, and every such
  change is on the next paper and in the next CSV — save the charges and capital a late barn record can still move.
- A late bill for last month, once it is closed, is the Owner's to enter, or the Manager's after she reopens it.
- Writes of money on one farm are made one after another, as a Venture's always were; the day's barn work is not.

- Closing is one more monthly step for the Owner. It sits beside the monthly Bank Check, which comes first.

## Addendum, 2026-10-14: what was sold on credit (ADR 0033)

The rule was asked only where a Money Event was written, so a Dispatch or a Sale left wholly on credit — which books
no money until the buyer pays — could be written, put right or voided into a closed month by anybody, though the
Monthly Report reads its milk sold or what she fetched, and what buyers owed at the month's end and how overdue, from
it. A closed month's Receivable is to stand as closed, so now:

- **A Sale or a Dispatch left owing answers to the closed month by what it left owing** (`answerForCredit`): written,
  put right or voided, what the record left owing as it stood and as it will stand — its day, the amount, the buyer
  and for a Sale whose purse (not the day he promised, which moves nothing he owed) — is weighed as money is. A change into, out of or within a
  closed month is the Owner's alone; anybody else is refused `month_closed`. Hers is kept under "Changed after
  closing" as the Sale or the Dispatch, by the buyer and, for a Sale, her tag, with what the month held of it owed
  before and after. A partly paid one is asked twice, once for its money and once for what is owed, and listed so.
- **A Correction that gives milk sent with its price to follow a price** leaves it owed, and is asked the same way.
- **A Buyer Statement** answers for the milk it prices or gives back, by the months that milk left in (ADR 0033); the
  Dispatches it priced answer through it, not on their own.
- **What was owed at a month's end** is read as owed then: milk a Buyer Statement priced is owed from when the
  statement was recorded, so a statement recorded after a closed month leaves that month's Receivable as it was closed,
  while the milk it priced counts in the milk sold of the month it left — the Owner's change, and listed. Voided once
  the month it was recorded in is closed, it is listed against that month too.
