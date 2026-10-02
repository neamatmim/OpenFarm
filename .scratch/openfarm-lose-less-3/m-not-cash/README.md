# M — Money that is not cash

Survey item M (`../survey.md`), opened 2026-10-02 at the Owner's asking. Cash now has a hand, a weekly count and a
Handover (`../../openfarm-lose-less/e-cash/`); bKash and the bank have nothing. Milk money comes in by bKash every
month, a trader may pay for a bull by bank, and a Venture's bull sold for cash at the haat is written into the Venture
Account the moment she is sold, though nobody has been to the bank.

**What the app already does** (read from the code, 2026-10-02):

- A **Money Event** has a Payment Method — cash, bKash or bank (`db/schema/money.ts:26`) — asked on every record that
  carries money through one field (`apps/web/src/components/payment-method.tsx`; `paymentMethodInput`,
  `money-inputs.ts:19`). bKash and the bank name **nobody** (`handOf`, `money-store.ts:367-389`) and **nothing else**:
  the `money_event` table has no account, no transaction ID and no reference (`db/schema/money.ts:142-194`).
- A **Handover**'s bank end is "the bank", one place (`handEnd`, `routers/cash.ts:20-23`), with its slip
  (`bank_needs_a_slip`, `cash-store.ts:518-524`); bank to bank is refused (`handover_goes_nowhere`, `cash-store.ts:511-517`).
- The **Bank Check** is the Venture Account's alone: `venture_bank_check` (`db/schema/venture.ts:755-781`), written by
  `ventures.checkTheBank` (`routers/ventures.ts:3076-3200`, with `month_not_over`, `month_before_the_venture` and
  `say_what_you_found_out`), its standing — disagreed apart from gone stale — worked out by `bankStandingOf`
  (`venture-store.ts:986-1058`), and a Settlement blocked over it (`settlement-store.ts:255-273`). **Nothing reads the
  Farm's own bKash or bank money against anything**: a Manager who took ৳5,000 in notes and wrote it as bKash leaves his
  Cash Count clean.
- **A Venture's animal sold for cash**: `bookSaleMoney` (`sale-store.ts:83-139`) books the Money Event in the
  Venture's purse and calls `bookSaleProceeds` (`venture-store.ts:1060-1132`), which writes a `sale_in` Venture
  Movement **on the sale day, at the full price, with her tag as its reference, whatever the payment method**.
  CONTEXT.md:360 says the Venture Account never takes cash. The cash Money Event does name a hand — the writer's — but
  Cash in Hand reads the Farm's purse alone (`cash-store.ts:44-50`), so the notes are named and never counted, and
  nothing records them reaching the bank. A Settlement's proceeds are read from those movements (`sale_in` →
  `proceedsBdt`, `venture-store.ts:429`; `settlement-store.ts:424`), so it counts money still in a pocket.
- **A Venture's animal sold by bKash** is taken the same way: the movement says the Venture Account has it, though a
  bKash number is never the Venture Account.
- **A Sale names the hand of whoever writes it**: `MoneyOfARecord.heldBy` (`money-store.ts:330-331`) is read by
  `handOf` but passed by no record. The Owner writing up the Manager's haat sale puts the notes in her own hand; the
  Manager's Friday count then comes up over and hers short. A Baki Payment the same (`routers/baki.ts:149-157`).

| #   | Ticket                                            | Blocked by |
| --- | ------------------------------------------------- | ---------- |
| 01  | A Venture's sale cash, held until it is deposited (done) | —          |
| 02  | Whose hand took the notes                         | —          |
| 03  | The Farm Accounts, named on bKash and bank money  | —          |
| 04  | The monthly check of a Farm Account               | 03         |

**Settled with the Owner, 2026-10-02, and not to be re-asked:**

- **The Farm lists its own bKash numbers and bank accounts** (M1). Money by bKash or bank — a Sale, a Baki Payment, a
  Dispatch, money by hand and the rest — names which of them it went into or came out of, and carries its transaction
  ID or reference. Each month the Owner reads each one's statement against what the farm believes, as a Venture's Bank
  Check already works.
- **A Venture's bull sold for cash at the haat is held in the seller's hand as that Venture's money** (M2), counted at
  the Friday Cash Count, until it is deposited with a slip; the Venture Account shows the sale's money only once
  deposited.

**Settled in drafting** (the Owner may overrule; nothing here was asked):

- **The word is Farm Account**: one of the Farm's own bKash numbers or bank accounts — the pair of the Venture Account,
  which is the Investors'. **Account** alone stays the sign-in (CONTEXT.md:404), and a **Purse** is still _whose_ money
  it was, where a Farm Account is _where_ it sits. The **Bank Check** is widened to read one, not joined by a second
  word.
- **Old money has no start day**, as Cash in Hand had none: money booked before the accounts were listed names no Farm
  Account and is read by no check. The first check of a Farm Account takes the statement as what it held, as the first
  Cash Count set a hand; every month after is read against that and what named the account since.
- **Whose hand, on a Sale or a Baki Payment**: the writer's unless the Owner names another Owner or Manager; a Manager
  names only their own — the Handover rule. Dispatch and money by hand are not widened: whoever writes those is the
  one at the gate.
- **A Venture's sale cash is deposited whole**: one Handover from a hand into that Venture's Venture Account, with the
  slip, naming the Sales whose notes it carries. The `sale_in` movement is written then, dated the day it went in, the
  slip as its reference. A Correction to the price of a Sale not yet deposited changes only what the hand holds; one
  already deposited moves the movement as today, and that month's Bank Check goes stale.
- **A count is of all the notes in the hand**, the Farm's and a Venture's together; a difference is the Farm's. The
  Venture is owed what its animal fetched, whole.
- **A Venture's animal is never paid by bKash** (refused): Investors' money reaches its account by bank or by a deposit
  slip, and a bKash number is the Farm's. By bank, the buyer pays the Venture Account and it lands on the sale day as
  today — carrying the transfer's reference (03) instead of her tag.
- **A Settlement waits for sale cash still in a hand**, as it waits for an open Float.
- **The Farm Accounts are the Owner's to list**, retired and never removed (the farm-lists rule); everyone else picks
  one by its name and last four digits (`maskedDigits`, `domain/masked-digits.ts`). The Vet writing his own fee by
  bKash names the Farm's number it came from: his bKash message shows it.
- **A reference is one payment**: the same transaction ID twice on one Farm Account is refused.
- **bKash to the bank is a Handover** with a Farm Account at each end — widening "one end is always a person".
- **A Farm Account month that disagrees or went stale is on the Owner's home** until read again or explained; a month
  never read is said on the account's own line only, as a Venture's is on its card. Nothing is blocked: the Farm has no
  Settlement to hold up.
