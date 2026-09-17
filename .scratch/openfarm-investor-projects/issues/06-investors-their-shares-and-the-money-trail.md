# Investors, their shares and the money trail

Status: resolved

Type: grilling

Assignee: Neamat (with Claude)

Blocked by: 03, 04

Map: [OpenFarm investor-funded fattening projects](../map.md)

## Question

**Grilling.** How does OpenFarm record who put in what and what they got back?

- **The Investor.** What is recorded (name, phone, NID, bank account, nominee)? An **Investor** is now its own word, not a Counterparty; is one person the same record across projects? Where does the photo of the stamped **Investment Agreement** live, and what does the system refuse without it?
- **The cap.** How does the system warn as the 20-Investor ceiling nears, counting people across all running projects including the Owner?
- **The share.** Is it any amount, or units at a fixed price? Capital closes at Buying and shares are fixed from then, so time-in does not weigh — unless we decide it does for money that arrived late in Open.
- **Money in and out.** How are capital received, top-ups, refunds of an under-funded project, and payouts (interim and final) recorded through the **Venture Account**? Bank channels only, so what reference or slip is required, and who records them?
- **Where it lives.** Release 1 made finance "an income/expense record, not a ledger". Investor money is not the Farm's income. Does it sit in Money Events with new Categories, in a separate project account, or does it need a small ledger after all?
- **The Venture Account's balance.** Does the system track it per Venture (capital in − spent − paid out, and the split between Cattle Budget and Running Budget), and does it warn when the Running Budget is nearly gone, before an Advance is needed?
- **Refunds and Advances.** How is a Cancelled Venture's refund recorded, and how is the Owner's Advance recorded so that settlement repays it at cost before profit?

Inputs from research:
- Warn when a project reaches 20 investors, and again at 50.
- Payments go through bank channels only, unless the legal-form ticket decides otherwise.
- Store each investor's stamped contract.
- Keep records at least 12 years.
- Build no sign-up, pay-in or referral features.
- Schemes commonly sell fixed-price shares (Tk 50,000–200,000) and give a certificate at the start.

## Answer

Decided with the Owner on 2026-09-18.

**Two purses, one record of money.** A Money Event gains a **Purse**: whose money it moved, the Farm's or a named Venture's. The Farm's monthly reports and the accountant export read the Farm's purse only; a Venture's statement reads its own. Nothing is recorded twice.

**Capital is not income.** Capital in, refunds, Advances and payouts are recorded against the Venture, never as Farm income or expense — the money was never the Farm's. Only the Farm's management share at settlement reaches its books as income, alongside the Owner's own payout as an Investor.

**Who pays the dealer.** The Farm buys all feed and medicine from its own account, as today, purse Farm. Each month OpenFarm works out what each Venture's animals consumed and one **Reimbursement** moves that sum from the Venture Account to the Farm's account.

**Buying cattle.** A **Buying Float** is drawn from the Venture Account before a Buying Trip and recorded against the Venture. Each Intake price and Hasil is recorded against the Float, and the unspent cash goes back with its slip: float out = animals + trip costs + cash returned.

**The share is a Unit.** A Venture sets a unit price and a number of Units; an Investor holds whole Units, and everything divides by Units held. Capital closes at Buying, so Units are fixed from then.

**The Investor record.** Name, phone, address, NID number, bank account, and a nominee (name, phone, relationship). A photo of the stamped Investment Agreement with its stamp value, date and serial. **No capital may be recorded against a Venture until that photo is there.**

**The cap.** Distinct people across every Venture that is not Settled or Cancelled, the Owner included: a warning from 15, and a refusal to record a 21st, with the reason shown. The Owner cannot override. The lawyer's answer changes the number, not the rule.

**What is watched.** Per Venture: capital in, spent, reimbursed, paid out, and the balance that should be in the Venture Account, split between Cattle Budget and Running Budget. The Owner is warned when the Running Budget falls below a set level, so an **Advance** is a decision rather than a surprise, and when the account's real balance does not match — checked against the bank monthly by the Owner.

Glossary: added **Unit**, **Purse**, **Reimbursement**, **Buying Float**.
