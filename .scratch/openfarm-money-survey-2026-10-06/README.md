# Survey of the farm's own money, 2026-10-06

Three read-only reviewers looked at the farm's own books, its reports, and the money screens. A finding is either **proven** (a temporary test went red, then the file was put back) or **traced** (read line by line).

## A. Cash in hand

1. **Proven.** A Cash Count is thrown off by money written up later but dated before it. `handsOf` adds every cash movement of all time plus each count's frozen difference, and never sets either against the moment of the count. Example: ৳500 of repairs is paid Wednesday and written up Saturday, dated Wednesday. Friday's count found ৳4,000, but the hand now reads ৳3,500: the ৳500 came off twice. A Handover with a back-dated `handedAt` does the same. Feed counts already handle this (`stock-store.ts` works the store out again as it stood at each count).
2. **Proven.** A recount compares against money that came in after the count. `recordCashCount` leaves out only its own count. Example: Friday's count is corrected on Sunday after ৳1,000 came in on Saturday. Its expected figure becomes ৳4,500 instead of ৳3,500.
3. **Traced (screen).** A Venture's sale cash deposited "today" is refused before noon, in English. The dialog sends `T06:00Z` (12:00 in Dhaka), and the server refuses it as a time to come, with no refusal word.
4. **Traced (screen).** Hand over cash can send something other than what is shown. When the farm has nobody else holding cash and lists a Farm Account, the select shows the account but sends "bank". With only one account it can never be changed. Listing only a bKash account removes the plain "Bank" choice.
5. **Suspected.** A departed Manager's hand offers handovers that are always refused (`holds_no_cash`).

## B. The approval line

1. **Proven.** Wage Draws get past the Approval Threshold. `piecesOf` adds up only `by_hand` money, so two draws of ৳15,000 against a ৳20,000 line both pass. A payday booked net of draws puts none of it to the Owner.
2. **Proven.** A bill gets past the line when its earlier-dated piece is entered second, because the week of pieces only looks back from the entry's own date.
3. **Traced.** The Owner can approve terms she never read. `approve` checks again only the amount, so a Correction to the Counterparty, Category or Purse while she reads goes through.
4. **Traced (screen).** After an `amount_changed` refusal, Approve keeps being refused. The error refreshes only the home screen, not the register.

## C. Reports and the accountant's export

1. **Proven.** Overheads leave out Wage Draws (`overhead-store.ts` reads `by_hand` only). Wages, and the per-head-per-day figure, are short by every draw.
2. **Proven.** For a bull the Farm bought from a Venture, the Farm's Margin uses her first Intake price, not what the Farm paid. Example: a Venture buys at ৳50,000, the Farm buys her at ৳63,000 and sells at ৳80,000. The Monthly report says ৳30,000 margin, where the truth is ৳17,000. The same holds for her cost in `animal-price-store.ts`, so the sold-under-cost notice is wrong. Returns already price her at ৳63,000.
3. **Traced.** A Transition Year longer than 366 days cannot be listed or exported, because the money period is capped at 366 days.
4. **Traced.** The accountant's CSV leaves out the bank or mobile-money transaction ID and the Farm Account, which the register shows.
5. **Traced, minor.** A Herd Cost for a Side with nobody standing is in neither a Side nor Overheads on the Monthly report.

## D. Money forms

1. **Traced.** Correcting a Wage Draw to bank or mobile money is always refused when the farm lists an account of that kind: the correction sheet has no account or transaction ID field.
2. **Traced.** The payment-method field keeps the chosen account across a change of method, and is refused `farm_account_not_that_kind`.
3. **Traced.** The money-entry sheet carries its Side, method, account, transaction ID and day over to the next entry.
4. **Traced.** The Bangla register prints a wage month as "2026-09".
5. **Traced.** Costs by Side shows a skeleton forever when the period is refused.
6. **Traced.** The bank check calls a month before the first reading a "first reading".
7. **Suspected.** The write-off dialog's amount goes stale after a part-payment.
8. **Traced.** Cash the Owner writes up cannot be put in the Manager's hand (only Sales and Receivable Payments accept `heldBy`).
9. **Traced.** One transfer that pays both a buyer's milk and cattle debts cannot be recorded, because the second part's transaction ID is refused. References are not case-folded.
10. **Traced, low.** Receivable payments and write-offs take no farm lock, so two payments at once can both pass "no more than owed".

## Status

| Group | Branch | Status |
| ----- | ------ | ------ |
| A     | fix/cash-counts | Done   |
| B     |        |        |
| C     |        |        |
| D     |        |        |
