# E — Who holds the farm's cash

Survey item E (`../survey.md`), opened 2026-09-30 at the Owner's asking. A haat is a cash place: a bull sells for
৳1.5–2 lakh in notes, the Manager buys feed and pays the lorry in cash, and staff draw on their wages before payday. The
app records that money moved; it never says whose hand it is in now.

**What the app already does** (read from the code, 2026-09-30):

- A **Money Event** has a Payment Method (cash, bKash, bank; cash by default) and the person who _typed_ it
  (`recordedBy`) — never who took the cash or who holds it (`db/schema/money.ts:142-194`). The table calls itself "Not a
  ledger: an income and expense record". No balance per person or per method exists anywhere.
- A **Sale** books what the buyer paid on the sale day (`sale-store.ts:87-139`); nothing says who took the notes or when
  they reached the Owner or the bank. A **Baki Payment** likewise (`baki.ts:96-110`).
- The only cash a person carries and accounts for is a **Venture's Buying Float**: bank-drawn by the Owner for one
  Buying Trip, reconciled to the taka against the animals, the trip's costs and the cash brought back with its deposit
  slip (`routers/ventures.ts:1597-1826`, CONTEXT.md:285). **The Farm's own Buying Trips carry cash unaccounted.**
- **Wages** are hand-entered Money Events, one per person per month, the person a Counterparty (`money-by-hand-store.ts`).
  **No advance, loan or payday deduction** exists.
- No cash book, no cash-in-hand figure, no bank deposit record for the Farm's own money (the Venture Account has its
  month-end bank check only).

| #   | Ticket                          | Blocked by |
| --- | ------------------------------- | ---------- |
| 01  | Cash in Hand, and a Handover (done) | —      |
| 02  | The weekly Cash Count (done)    | 01         |
| 03  | A Float for the Farm's own trip (done) | 01  |
| 04  | A Wage Draw, taken off at payday | —         |

**Settled with the Owner, 2026-09-30, and not to be re-asked:**

- **Cash in Hand is per person**: every cash Money Event names whose hand it went into or came out of; a Handover
  (Manager → Owner) or a bank deposit moves it on (D1).
- **The Manager counts the cash in hand weekly, the Owner signs it off**; a difference over the Owner's line is told to
  the Owner (D2).
- **The Farm's own Buying Trips get a Float**, reconciled on return as a Venture's is (D3).
- **A Wage Draw has a balance and is taken off the wage at payday** (D4).

**Settled in drafting:**

- **"Advance" is the Venture's word** (CONTEXT.md:267): a staff member's money ahead of payday is a **Wage Draw**.
- **Buying Float is widened**, not joined by a second word: the Farm's own trip is drawn from the Owner's Cash in Hand
  rather than the Venture Account, and reconciled the same way.
- **bKash and bank are not Cash in Hand**: only a cash Money Event names a hand.

## Decisions for the Owner

1. **Whose hand the cash is in** — **each person who handles cash has a Cash in Hand: every cash Money Event names whose
   hand it went into or came out of, and a handover (Manager → Owner) or a bank deposit moves it on (recommended)** /
   one farm cash box, one figure / only record who took a Sale's cash, no balance.
2. **Counting it** — **the Manager counts the cash in hand weekly and the Owner signs the count off; a difference over a
   line is told to the Owner (recommended, as the store count is)** / only when cash is handed over / never counted.
3. **The Farm's own buying trips** — **a Trip Float for the Farm's trips too: cash handed to the Manager before the haat,
   reconciled on return against the animals, the costs and the cash brought back (recommended, as a Venture's is)** /
   only record who carried the money / leave as it is.
4. **Staff advances** — **an advance to a person is recorded with a balance, and taken off their wage at payday
   (recommended)** / recorded only, deducted by hand / not now.

Once answered, the tickets go in `issues/` beside this README, as the other plans' do.
