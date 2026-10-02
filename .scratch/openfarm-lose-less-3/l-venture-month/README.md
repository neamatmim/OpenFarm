# L — A Venture's month, paid in full

Survey item L (`../survey.md`), opened 2026-10-02. The Farm feeds and doses everybody's cattle and a Venture pays it
back once a month (CONTEXT.md:301). A cost that lands in a month after it was paid back — a shed phone's feeding sent
late, a Herd Cost typed late, feed priced late, a Correction, a back-dated Internal Sale — is charged to the Investors
at Settlement and never paid to the Farm: it stays in the Venture Account, and nothing notices it there.

**What the app already does** (read from the code, 2026-10-02; none of it yet proven by a failing test):

- **One Reimbursement per Venture per month**, the Owner's, by bank, for a month that is over, at exactly what the farm
  works out now (`routers/ventures.ts:3341-3450`): refused `amount_changed` (3383), `nothing_to_reimburse` at nothing
  or less (3386), and `month_already_reimbursed` for a second (3405-3420). One act writes the Venture Movement out and
  the Farm's Money Event in. Its figure may never be corrected (`corrections/venture-movement.ts:151-158`,
  `reimbursement_is_computed`); its day and reference may.
- **The figure is `consumedBy`** (`cost-store.ts:863-915`): feed, medicine, the Vet, Herd Costs, Selling Trips and
  brokers, charged by who owned the animal that day. It sums `costsOf` (`domain/holding.ts:116-133`), which counts
  unpriced kilos and uncosted doses, and returns neither: feed nothing can price is ৳0 (`domain/costs.ts:299-305`), an
  uncosted dose ৳0 (`cost-store.ts:115-124`). A month with either is reimbursed with them at nothing.
- **The Settlement counts a month paid whatever it now comes to.** `monthsOwed` (`settlement-store.ts:141-160`) asks
  only months never reimbursed whose figure is not nothing. Meanwhile the Settlement charges the run its live costs
  (`whatItWasCharged`, 333), so a late cost lowers the Investors' payouts and the Farm never receives it.
- **What is left in the account is neither swept nor stopped.** `overBdt` is what the account would hold once the
  Advance, every payout and the Farm's share have left (`settlement-store.ts:483-489`). Under a taka it is swept to the
  Farm (`sweptUp`, 118-129); a taka or more is left alone, `whatBlocksIt` (184-275) never reads it, the sheet does not
  show it, and `nothingLeftToPay` (617-629) settles the Venture with it still there. CONTEXT.md:287 already says a taka
  or more "is the Owner's to go and find"; nothing tells her it is there.
- **The Settlement does refuse a missing price**, over the whole run (`a_price_is_missing`, 220-228), so a month
  reimbursed at ৳0 for unpriced feed is found only at the end, when the feed is priced and the month counts as paid.
- **Nothing says a month's Reimbursement is due.** The Venture's notices are `monthly_sum_missed` and
  `investor_statement_due` (`domain/notice-facts.ts:78-86`, `163-171`); the second is the pattern to copy — once per
  Venture per month by a composite id, the Digest, the Owner alone, raised by `theSweep`
  (`investor-statement-notice.ts`, `the-day-turns.ts:595-628`, `632-648`).
- **The Running Budget is read off the account** (`venture-store.ts:245`), which moves only when a Reimbursement is
  taken, so everything eaten since the last one still counts as held. Both `runningBudgetLow` in `ventureView`
  (`venture-store.ts:355`) and its twin in the Manager's `running` (`routers/ventures.ts:774` — not in the survey) read
  it; the warning comes about a month late.
- The seed reimburses each month and then reads the statement (`seed/ventures.ts:468-535`).

| #   | Ticket                                              | Blocked by |
| --- | --------------------------------------------------- | ---------- |
| 01  | A Settlement whose account does not add up waits    | —          |
| 02  | A late cost rides on the next month's Reimbursement | 01         |
| 03  | A month with a price missing is not reimbursed      | 02         |
| 04  | The Owner is told a month's Reimbursement is due    | 02         |
| 05  | The Running Budget warning counts what is owed      | 02         |

**Settled with the Owner, 2026-10-02, and not to be re-asked:**

- **A cost landing in a month already reimbursed is carried into the next month's Reimbursement automatically, as its
  own line — more or less.** The last Reimbursement before the Settlement catches whatever is left. **One transfer a
  month, as now.**

**Settled in drafting** (the Owner may overrule):

- **01 first:** stopping a Settlement from closing over money left in the account protects the Investors and the Farm
  today, before the carrying exists, and it still catches whatever 02 does not (plan K's no-outing bull, a defect not
  yet found). Its word is new: `the_account_does_not_add_up`, said with the taka over or under, shown on the sheet.
- **"Carried" is not a new glossary word:** **Reimbursement** is widened. Each carried line is one earlier month — what
  that month comes to now, less what has already been paid for it, the month's own figure and every line carried for
  it since — so a month reimbursed out of order is never counted twice.
- **A month whose total, carried lines and all, comes to nothing or less** is refused `nothing_to_reimburse`, as now,
  and its lines ride on to the next month. A Farm still overpaid at the end shows as 01's account that does not add up;
  a refund kind is not built until the live farm meets one.
- **A month with unpriced feed or an uncosted dose** — its own or in a line it carries — **is not reimbursed until it is
  priced**, refused `a_price_is_missing`, the Settlement's own word.
- **"Reimbursement due" goes to the Owner in the Digest**, raised by the sweep from the first of the month for the month
  just over, once per Venture per month, while the Venture is running and its month comes to more than nothing.
- **The Running Budget warning** subtracts what its animals have cost since the last Reimbursement (every month not yet
  reimbursed, this one so far, and lines not yet carried). The held figure itself, and what an Investor's অগ্রগতি says,
  stay what the account holds.
- **The last month:** a late cost landing after the final month was reimbursed waits for the month after it to be over,
  one transfer a month; the Settlement says what is owed meanwhile. Reimbursing a month in progress once no animal
  stands is not built.
