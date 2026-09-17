# Settlement: from the last Sale to each investor's payout

Status: resolved

Type: grilling

Assignee: Neamat (with Claude)

Blocked by: 04, 05, 06

Map: [OpenFarm investor-funded fattening projects](../map.md)

## Question

**Grilling.** How is a project closed out?

- **The calculation, step by step:** Sales in (Internal Sales included), less the charges the Venture carries, less the Owner's Advance repaid at cost, gives the Venture's result; the split is 60 : 40 by default, and each Investor's part divides by **Units** held. There is no fee to take first (mudarabah). Then: what is left in the Venture Account — unspent Running Budget and returned capital — goes back with the profit, and the rounding remainder to whole taka goes where?
- **Loss.** What does a loss look like on each investor's line?
- **Timing.** When does settlement happen: after the last Sale, or at a date with unsold Animals valued? Can there be interim distributions?
- **Approval.** Who prepares it and who approves it (the Owner)? What does an investor sign or acknowledge?
- **After settlement.** What happens when a record changes afterwards: a Sale Correction, a late Vet Fee, a Feed price corrected? Is settlement frozen, reopened, or adjusted with a follow-up line?
- **What is kept** as the settlement record for the audit trail and for any dispute years later (records are kept at least 12 years).
- **Loose ends before settling:** unpriced feed and uncosted doses block it already; what about an unreconciled Buying Float, a Reimbursement not yet transferred, or a Venture Account balance that doesn't match the bank?

Inputs from research:

- An investor's result can be negative, and the statement must be able to show it.
- No distribution is made until capital is intact, so any interim payout must be reversible.
- No scheme publishes a settlement statement, so this one is designed from scratch.

## Answer

Decided with the Owner on 2026-09-18.

**The calculation**, in this order:

```
  Sales of its Animals (Internal Sales included)
− Cattle bought (price + Hasil + Buying Trips)
− Feed, doses, Vet Fees, Herd Costs charged to its Animals
− Selling Trips
= profit, or loss

  profit × 60% → Investors, divided by Units held
  profit × 40% → the Farm
  loss        → comes off capital, divided by Units held
```

Capital is returned whole beside the profit, out of what the Venture Account holds. The Owner's **Advance** is repaid at cost from that cash before capital goes back — it is not a charge, because the costs it paid are already in the list above. Unspent Running Budget is not added either: it is capital that was never spent, and it returns as capital.

Capital comes back whole before any profit exists, as mudarabah requires. There is no fee to take first.

_Corrected on 2026-09-18: the first version of this sum both subtracted the charges and added back the unspent Running Budget before subtracting capital, which double-counts. The prototype caught it._

**Timing.** One payout, at the end: every Animal gone, every loose end clear. No interim distributions.

**The bad case.** Where proceeds cannot repay the Advance in full, it is still repaid before capital returns — it funded that Venture's own feed and medicine — so Investors get back less capital. The statement shows it as its own line.

**Before it can settle**, all four must be true:

- every Animal gone (sold, Internal Sale, or dead and recorded);
- no unpriced feed and no uncosted doses;
- every Buying Float reconciled and every Reimbursement transferred;
- the Venture Account's real balance equal to what OpenFarm says it holds.

**Rounding.** Each Investor's payout rounds down to whole taka; the few taka over go to the Farm's share, shown as a rounding line. Nothing is paid out that the account does not hold.

**Approval.** The Owner approves the Settlement as one act, which freezes the figures. Each payout is then recorded with its bank reference, each Investor's statement carries the payout details, and a signed copy or reply is recorded as their acknowledgement when it comes.

**Afterwards.** The figures stay as approved. A later Correction or late cost is a **Settlement Adjustment** against the Venture, showing each Investor's revised share: above a farm-set amount it means a supplementary payout or a recorded waiver from the Investor; below it, it is noted and nothing moves. A reissued statement shows both.

**What is kept.** The frozen figures (proceeds, every charge, Advance repaid, capital, profit, each Investor's Units, share, rounding and payout), the statement issued to each Investor, each payout's bank reference, acknowledgements as they arrive, and any Settlement Adjustments. Never deleted; kept at least 12 years.

Glossary: added **Settlement** and **Settlement Adjustment**.
