# 06 — হিসাব নিকাশ: the paper when the Venture ends

**What to build:** The sheet an Investor checks the whole run against. It is the document the arrangement finally rests on: if he cannot follow it line by line to his own payout, the Farm has not accounted to him.

On it:

- **Proceeds:** what the Animals fetched — Sales, and Internal Sales out.
- **Every charge as its own line:** what they cost to buy, the Hasil, the Trips, feed, doses, the vet, the Herd Costs.
- **Profit** — proceeds less everything charged — and the split by the percentages **his** Agreement froze.
- **Profit per Unit**, the **rounding line to the Farm**, and the **Farm's management share as its own line**, which story 12 asks for wherever an Investor's payout is shown.
- **Per Unit: capital in → taka back**, which is the line he will actually read first.
- **His** capital returned, **his** profit, and **his** payout with the bank reference it went on.
- **The Owner's Advance repaid at cost**, said plainly as the Owner's own money coming back rather than as a charge.
- **What happened to the herd:** bought and the average buying price, sold and the average sale price, bought back, died. The result with a story attached.
- **The note** that anything arriving later comes as a **Settlement Adjustment** rather than by this sheet being rewritten.

A **loss** reads as a loss: the label says so, the figure carries no minus sign tucked after the taka mark, and a share that went the wrong way is taken off capital rather than added to it — the same decision ticket 04 of the finishing set made for the screen, so the paper and the screen say it the same way.

**Reissued after a Settlement Adjustment.** The frozen figures stand; the reissue shows what the Adjustment changed beside them, never instead of them. An Investor holding two sheets must be able to tell which is which and see that the Farm did not quietly restate the first.

**Blocked by:** 01 (what a Venture Statement is)

**Status:** ready-for-agent

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 6, user stories 80, 81, 83, 84, and story 12 for the Farm's share; [the prototype verdict](../../openfarm-investor-projects/issues/08-prototype-investor-statements.md), document 3; `CONTEXT.md` — **Settlement**, **Settlement Adjustment**, **Advance**, **Unit**, **Internal Sale**.

- [ ] The paper prints proceeds, every charge as its own line, profit, the split, profit per Unit, the rounding line and the Farm's share, and his capital, profit and payout with its bank reference
- [ ] It prints the Advance repaid at cost, as the Owner's money returning rather than as a charge
- [ ] It prints the herd's story: bought and average buying price, sold and average sale price, bought back, died
- [ ] A loss reads as a loss — labelled, unsigned, and taken off capital
- [ ] The figures are the **frozen** ones the approval wrote down, not what the costing says today
- [ ] A reissue after a Settlement Adjustment shows what changed beside what was frozen, and says which sheet is which
- [ ] It shows his Units and payout and no other Investor's, beside the Farm's own share
- [ ] Tests cover a Venture in profit with a rounding remainder that is not zero, one in loss, an Advance repaid in both, a reissue after an Adjustment, and two Investors' papers carrying nothing of each other's

## Checked before starting

**Read the frozen figures, not the costing** — and almost all of them are already frozen. `ventureSettlement` (`packages/db/src/schema/venture.ts:319`) holds `proceedsBdt`, `chargedBdt`, `profitBdt`, `investorsPercent`, `units`, `investorsBdt`, `perUnitBdt`, `roundingBdt`, `farmBdt`, `advanceBdt`, `capitalBdt`, `balanceBdt`, and — the part this paper most needs — **`charges` as jsonb, every charge as its own `{ word, bdt }` line**, with the comment saying they live there because they are frozen and never queried. `ventureSettlementShare` (`:372`) holds one row per Agreement with `units`, `capitalBdt`, `shareBdt`, `payoutBdt`, `paidMovementId`, and the acknowledgement. So his capital, his profit and his payout are read straight off his share row, and the split lines off the settlement row. Nothing here needs recomputing and nothing should be.

**The payout's bank reference is one hop away.** The share row carries `paidMovementId`, not the reference itself; the reference is on the **Venture Movement** that the money went out on. Print it from there — and decide what the paper says for a share not yet paid, since a settlement statement may well be produced before the last transfer has gone.

**The herd's story is the one thing approval did not freeze.** Bought, average buying price, sold, average sale price, bought back, died — none of it is on `ventureSettlement`. It is the Venture's Animals read over their whole life, and the buy-back at wind-up is its own act (increment 5, ticket 04) rather than a Sale, so it counts separately from "sold". Two ways out and this ticket must pick one: read it live from the Animals, which is safe because ownership and prices of a settled Venture cannot move any more (that is what the finishing set's tickets 02 and 03 now guarantee), or freeze it at approval like the rest. Reading live is the smaller change and the guarantee is real; say so on the ticket's face either way, because "why is this one part of the sheet not frozen" is a fair question.

**Read `ventures.approvedSettlement`, never `ventures.settlement`.** The first (`routers/ventures.ts:1327` → `readSettlement`, `settlement-store.ts:531`) returns the frozen row; the second (`:1250` → `settlementOf`) recomputes from today's costing and is what the screen shows _before_ approval. The comment at `:1322` says why in one line: "what an Investor is shown a year later has to be what he was shown on the day." `CHARGE_WORDS` (`settlement-store.ts:37`) is the seven charge lines, in order.

**The read carries every Investor, and this paper is for one.** `Payout` (`settlement-store.ts:258`) is `{ agreementId, investorId, name, units, capitalBdt, shareBdt, payoutBdt }` and the settlement read returns them all — including the other men's **names**. Narrow on the server, as ticket 02 must for the joining letter; the same narrowing should serve both.

**Narrow by Agreement, as ticket 01 built it.** `venture_settlement_share` is unique on `(settlementId, agreementId)` and its comment says "the same person may hold two papers on one Venture" — but `investment_agreement_uidx` is unique on `(venture_id, investor_id)` (`venture.ts:157`), so today he cannot. One Agreement per man per Venture means one share, and asking by Agreement is both unambiguous and future-proof if that index is ever loosened. The two comments disagree and one of them should be put right.

**`perUnit` is floored to whole taka and the remainder goes to the Farm** — the formula is on the finishing set's spec and on increment 5's ticket 05. The paper prints the rounding line rather than hiding it, because an Investor who multiplies profit per Unit by his Units and gets a taka less than his payout will ask, and the answer should already be on the sheet.
