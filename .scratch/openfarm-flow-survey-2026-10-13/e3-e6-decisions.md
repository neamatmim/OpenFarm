# Two money decisions for the Owner (and the accountant) — 2026-10-13

From the flow survey (E3 and E6). Nothing here is built; each needs a yes before it is.

## E3. Loans, the Owner's own money, and big machines

**Today.** Every hand-entered Money Event is either a cost or an income. Money going out by hand that is not a Herd
Cost is an **Overhead** (CONTEXT.md), so it is charged to the month and comes off both Sides' **Side Result**. There
is no category for a loan, a loan repayment, money the Owner puts in or takes out, or a machine that lasts years
(`packages/api/src/money-store.ts`, the standard categories). So:

- a ৳3 lakh chopper under "Equipment" makes that month look ৳3 lakh worse, and the next eleven better;
- a bank EMI entered as a cost counts the loan's principal as an expense — the accountant would not;
- a loan received, entered under a made-up "in" category, looks like income;
- the Owner paying a bill from her own pocket either is not entered (and the books are short) or drives a hand's cash
  negative.

**Options.**

|                                                       | What it is                                                                                                                                                                                                                                                                                                                    | For                                                               | Against                                                                                                          |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **A. A third kind of money: "not income or expense"** | Standard categories that move cash but stay out of every result: _Owner's money in_, _Owner's drawings_, _Loan received_, _Loan principal repaid_, _Machine or building bought_. Loan **interest** stays an ordinary cost. They show in the month's cash flow and the Cash Position, never in Net, Overheads or Side Results. | Matches how an accountant keeps books; Side Results stop jumping. | No depreciation: a machine's cost never reaches the results unless the accountant adds it (option A+ below).     |
| **A+. A, plus depreciation**                          | As A, and a machine bought is spread over its life (e.g. 5 years) as a monthly Overhead.                                                                                                                                                                                                                                      | Results carry the real cost of the machine.                       | More to build and explain; the accountant may prefer to do it in the books.                                      |
| **B. A flag on any category: "outside the results"**  | The Owner marks which categories stay out of results, and adds her own.                                                                                                                                                                                                                                                       | Flexible; one switch.                                             | Easy to mark wrongly; the accountant's categories should be fixed, not chosen.                                   |
| **C. Leave it**                                       | Loans, owner money and machines stay in the accountant's books, not the app.                                                                                                                                                                                                                                                  | Nothing to build.                                                 | The app's cash never agrees with the hands and the bank; Side Results stay wrong in a month with a big purchase. |

**Recommendation: A**, with the five standard categories above and loan interest as a cost. Add depreciation (A+)
only if the accountant asks for it in the app.

**Questions for the Owner:**

1. Does the farm have a bank or NGO loan now, or expect one? Paid monthly (EMI)?
2. Do you put your own money in, or take money out for the household, from the farm's cash or accounts?
3. Have you bought, or will you buy, anything costing more than about ৳50,000 that lasts years (chopper, milking
   machine, generator, shed)?
4. Does your accountant want the app's monthly report to show depreciation, or will they do it?

## E6. Closing a month

**Today.** Nothing is ever closed. Hand-entered money may be dated any past day (only a future day is refused,
`money-by-hand-store.ts`), and the Manager may correct for 30 days. So a monthly report already printed and handed to
the accountant — or a Venture's monthly paper sent to Investors — can change afterwards with no sign.

**Options.**

|                                 | What it is                                                                                                                                                                                                                                                                   | For                                                     | Against                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------- |
| **A. The Owner closes a month** | Once approvals, cash counts and bank checks are done, the Owner closes the month. Anything dated into it after that (an entry or a correction) waits for the Owner's approval, and the next month's paper lists "changed after closing". The Owner may reopen with a reason. | A printed paper stays true; nothing is lost, just held. | One more monthly step for the Owner; a late bill needs her approval.    |
| **B. No lock, only a note**     | Months stay open; each paper records when it was made, and the next one lists anything entered or changed into an earlier month since.                                                                                                                                       | Nothing is ever held up.                                | Papers can still change underneath the accountant; only a list says so. |
| **C. Leave it**                 | As today.                                                                                                                                                                                                                                                                    | —                                                       | Printed and real figures can quietly disagree.                          |

**Recommendation: A**, closing on or after the 7th for the month before, so late bills have a week. It fits the monthly
Bank Check the app now asks for.

**Questions for the Owner:**

1. Should a closed month hold Venture papers too, or only the Farm's own?
2. Who may reopen a month — only you?
3. Is the 7th the right day, or does the accountant close on another?
