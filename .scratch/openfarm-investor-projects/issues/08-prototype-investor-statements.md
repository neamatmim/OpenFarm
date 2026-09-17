# Prototype: investor statements

Status: resolved

Type: prototype

Assignee: Neamat (with Claude)

Blocked by: 05, 06, 07

Map: [OpenFarm investor-funded fattening projects](../map.md)

## Question

**Prototype (HITL).** Which documents does an investor receive, and what is on each? Build rough A4 mock-ups (Bangla with English labels, like the Release 1 report set) and react to them:

- **On joining:** acknowledgement of capital received and a summary of the contract terms.
- **During the Venture:** their Units and what share that is; the Venture's Animals with photos, latest weights and ADG; spend so far against the two budgets; days to the Target Window.
- **At settlement:** Sales, charges, the Advance repaid, capital back, profit or loss, the 60 : 40 split, their Units' share, the rounding line, the payout and its bank reference. And the reissued version after a Settlement Adjustment.
- **Privacy:** what one investor must _not_ see about other investors, and what the Farm keeps private (buyer names, per-Animal prices?).

The verdict fixes the fields; the mock-ups are linked as an asset.

Inputs from research:

- No capital or return promise on any document, projections included. A projected weight is fine; a projected taka return to the investor is the risky kind.
- Schemes send a certificate at the start and photo and weight updates along the way.

## Answer

Built and reacted to on 2026-09-18. Prototype on branch `prototype/investor-statements` (`/prototype/investor-statement?variant=A|B|C`), also published as a canvas at https://claude.ai/artifact/FifJiMPFWJpfJQ5RRVkZ6h. Every figure in it is invented.

**Three documents**, A4, Bangla with English labels, on the Farm's letterhead with its Registration number:

1. **যোগদানপত্র — on joining.** Investor, address, phone, NID, nominee; the Venture, unit price, Units held, capital received, date, bank reference; the terms in seven plain lines (mudarabah; 60 : 40; loss off capital; death is the Venture's loss; window and Wind-up; no early exit; the Arbitrator); the stamp's value, date and serial; two signatures.
2. **অগ্রগতি — while it runs.** Head alive and died; average weight then and now; daily gain; days to the window; **spend at Category level** (cattle, feed, medicine and vet, other) against both budgets and what is left; a per-Animal table with tag, photo, intake weight, latest weight and ADG. Sent **monthly**, and when buying closes, at the first Sale, and when the Wind-up Period starts.
3. **হিসাব নিকাশ — at settlement.** Proceeds (Sales and the Internal Sale); every charge as its own line; profit; the 60 : 40 split; profit per Unit; the rounding line to the Farm; **per Unit: capital in → taka back**; the Investor's capital returned, profit and payout with its bank reference; a **what happened** line (bought, average buying price, sold, average sale price, bought back, died); the Advance repaid at cost; and the note that a later Correction comes as a Settlement Adjustment.

**Decided while reacting:**

- **Spend stays on the progress sheet**, at Category level. Investors are owed a true account. What never appears: unit prices per kg, supplier names, or what any other Investor holds.
- **Photos stay**, one per Animal. An Investor who cannot visit the shed is buying on trust.
- **No projection anywhere.** Weights and days are facts; a projected price or return is not, and would read as a promise. Every sheet carries the "no guaranteed return, loss comes off capital" footer in Bangla and English.
- **One Investor never sees another.** No Investor list, no other holdings.

**A bug this caught.** The calculation first written on [Settlement](./07-settlement.md) double-counted: it subtracted every charge _and_ added back the unspent Running Budget before subtracting capital, which gives the wrong profit in taka. Corrected there: **profit = proceeds − everything charged**; capital returns whole beside it, and the Advance is repaid out of the Venture's cash rather than counted as a cost, because the costs it paid are already in the list.
