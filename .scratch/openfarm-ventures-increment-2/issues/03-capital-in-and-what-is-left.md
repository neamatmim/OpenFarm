# 03 — Capital in, and what is left

**What to build:** The Owner records capital as it arrives — which Investor, which Venture, how much, the day, and the bank reference — and the system refuses it in any form but a bank transfer, cheque or deposit slip, and refuses it at all until the stamped Agreement's photo is on file. A Venture shows what it has: capital in, what is spent, what is paid out, and the balance the Venture Account should hold, split between the Cattle Budget and the Running Budget. Cancelling a Venture refunds every taka that came in, recorded the same way.

**Blocked by:** 02

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 2, user stories 15, 16, 18, 21, 22; [Investors, their shares and the money trail](../../openfarm-investor-projects/issues/06-investors-their-shares-and-the-money-trail.md); `CONTEXT.md` — **Venture Account**, **Cattle Budget**, **Running Budget**, **Unit**.

- [x] Capital received is recorded against an Investor's Agreement with the day and the bank reference; cash and mobile money are refused, with a word the reader has
- [x] It is refused while the Agreement has no stamped photo
- [x] It is refused once the Venture has left Open, so every share is fixed for the run
- [x] Capital in never becomes a Money Event: it is the Venture's money, and the Farm's income and expense record does not count it
- [x] A Venture reads capital in, spent, paid out and the balance its account should hold, split across both budgets
- [x] Cancelling a Venture refunds every capital movement it took, each recorded with its own reference, and the Venture ends Cancelled
- [x] Tests cover capital in by bank, the three refusals, the balance after several Investors, and a cancelled Venture's refunds

## What was built

- A **Venture Movement**: one movement of a Venture's own money through its Venture Account, carrying the
  day the bank moved it and the reference on the transfer, cheque or deposit slip. Capital in and the
  refund that undoes it today; the Float, the Advance, the Reimbursement and the payout as their own work
  arrives.
- `takeCapital` refuses money that came by hand, money against a paper the farm has no photo of, money
  once the Venture has left Open, and money beyond what the Agreement's Units are worth — each in the
  reader's own language.
- A Venture reads capital in, refunded, spent, paid out and the balance its account should hold, with
  that balance split across the two budgets in the plan's own proportion.
- Calling a Venture off needs a refund for every taka it took, each with its own day and reference, and
  each carrying its own Audit Event. The counts are made inside the write's transaction.
- Capital is never a Money Event, and a test holds the Farm's money list empty while a Venture fills up.

## What the review caught

- **The Floor read what had once arrived rather than what the Venture holds.** Money sent back is not
  money to start on.
- **`cancel` read what came in outside its own transaction**, so capital committing while the Owner
  filled in the refunds would have been left behind in a Venture already called off.
- **Nothing stopped an Investor paying twice for the same Units** — and capital divides by Units, so that
  money would have taken two shares of the profit while holding one share of the Venture.
- Refunds carried no Audit Event of their own, so "where is my money" had no line to point at.
- The ninth orphaned doc comment: `takeCapital` went in between `cancel`'s comment and `cancel`.
- A fortnight-old cached answer would have drawn `৳NaN` — and, worse, crashed on a Venture's signed-for
  line, which the previous ticket added without renaming the cache key.
- The Floor check on `startBuying` had been passing vacuously since increment 2 ticket 01, because it
  read a stub that always returned zero. It is now real, and tested both ways.
