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

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 6, user stories 80, 81, 83, 84, and story 12 for the Farm's share; [the prototype verdict](../../openfarm-investor-projects/issues/08-prototype-investor-statements.md), document 3; `CONTEXT.md` — **Settlement**, **Settlement Adjustment**, **Advance**, **Unit**, **Internal Sale**.

- [x] The paper prints proceeds, every charge as its own line, profit, the split, profit per Unit, the rounding line and the Farm's share, and his capital, profit and payout with its bank reference
- [x] It prints the Advance repaid at cost, as the Owner's money returning rather than as a charge
- [x] It prints the herd's story: bought and average buying price, sold and average sale price, bought back, died
- [x] A loss reads as a loss — labelled, unsigned, and taken off capital
- [x] The money figures are the **frozen** ones the approval wrote down; the herd's story is read from the records and is headed as such
- [x] A reissue after a Settlement Adjustment shows what changed beside what was frozen, and says which sheet is which
- [x] It shows his Units and payout and no other Investor's, beside the Farm's own share
- [x] Tests cover a Venture in profit with a rounding remainder that is not zero, one in loss, an Advance repaid in both, a reissue after an Adjustment, and two Investors' papers carrying nothing of each other's

## Checked before starting

**Read the frozen figures, not the costing** — and almost all of them are already frozen. `ventureSettlement` (`packages/db/src/schema/venture.ts:319`) holds `proceedsBdt`, `chargedBdt`, `profitBdt`, `investorsPercent`, `units`, `investorsBdt`, `perUnitBdt`, `roundingBdt`, `farmBdt`, `advanceBdt`, `capitalBdt`, `balanceBdt`, and — the part this paper most needs — **`charges` as jsonb, every charge as its own `{ word, bdt }` line**, with the comment saying they live there because they are frozen and never queried. `ventureSettlementShare` (`:372`) holds one row per Agreement with `units`, `capitalBdt`, `shareBdt`, `payoutBdt`, `paidMovementId`, and the acknowledgement. So his capital, his profit and his payout are read straight off his share row, and the split lines off the settlement row. Nothing here needs recomputing and nothing should be.

**The payout's bank reference is one hop away.** The share row carries `paidMovementId`, not the reference itself; the reference is on the **Venture Movement** that the money went out on. Print it from there — and decide what the paper says for a share not yet paid, since a settlement statement may well be produced before the last transfer has gone.

**The herd's story is the one thing approval did not freeze.** Bought, average buying price, sold, average sale price, bought back, died — none of it is on `ventureSettlement`. It is the Venture's Animals read over their whole life, and the buy-back at wind-up is its own act (increment 5, ticket 04) rather than a Sale, so it counts separately from "sold". Two ways out and this ticket must pick one: read it live from the Animals, which is safe because ownership and prices of a settled Venture cannot move any more (that is what the finishing set's tickets 02 and 03 now guarantee), or freeze it at approval like the rest. Reading live is the smaller change and the guarantee is real; say so on the ticket's face either way, because "why is this one part of the sheet not frozen" is a fair question.

**Read `ventures.approvedSettlement`, never `ventures.settlement`.** The first (`routers/ventures.ts:1327` → `readSettlement`, `settlement-store.ts:531`) returns the frozen row; the second (`:1250` → `settlementOf`) recomputes from today's costing and is what the screen shows _before_ approval. The comment at `:1322` says why in one line: "what an Investor is shown a year later has to be what he was shown on the day." `CHARGE_WORDS` (`settlement-store.ts:37`) is the seven charge lines, in order.

**The read carries every Investor, and this paper is for one.** `Payout` (`settlement-store.ts:258`) is `{ agreementId, investorId, name, units, capitalBdt, shareBdt, payoutBdt }` and the settlement read returns them all — including the other men's **names**. Narrow on the server, as ticket 02 must for the joining letter; the same narrowing should serve both.

**Narrow by Agreement, as ticket 01 built it.** `venture_settlement_share` is unique on `(settlementId, agreementId)` and its comment says "the same person may hold two papers on one Venture" — but `investment_agreement_uidx` is unique on `(venture_id, investor_id)` (`venture.ts:157`), so today he cannot. One Agreement per man per Venture means one share, and asking by Agreement is both unambiguous and future-proof if that index is ever loosened. The two comments disagree and one of them should be put right.

**`perUnit` is floored to whole taka and the remainder goes to the Farm** — the formula is on the finishing set's spec and on increment 5's ticket 05. The paper prints the rounding line rather than hiding it, because an Investor who multiplies profit per Unit by his Units and gets a taka less than his payout will ask, and the answer should already be on the sheet.

## What was decided while building

**Nothing on the money side is recomputed.** `hisSettlement` reads what approval froze and narrows it to his Agreement — the settlement row for the run's figures and the split, his own share row for his capital, his share and his payout. The Venture's frozen read carries every Investor's share and every Investor's _name_, so the narrowing happens before it leaves.

**The payout's reference needed the read widened.** A payout **Venture Movement** carries the Venture and not the Agreement, so there is no way back to it from the Agreement — the link is `paidMovementId` on the share row, which `readSettlement` was collapsing to a `paid` boolean. It now says the id as well, and the sheet looks the movement up by it. A sheet produced before the last transfer has gone says "not yet sent" rather than leaving a blank where a reference belongs.

**Every figure with a direction got a label, and the first draft only gave two of them one.** Every money figure prints unsigned with the label saying which way it went, because `৳-১২,৩৪৫` under a heading that says Profit is how a man reads a loss as a small gain. The first version did that for the run's result and his own share and left both the Farm's share and the per-Unit figure reading as gains on a losing run — "খামারের অংশ / The Farm's share: ২০,০০০" says the Farm took money out of a run that lost it, and "প্রতি ইউনিট: ৩,০০০" says a Unit gained three thousand when it lost them. I caught the first, a review caught the second, and the loss sheet now asserts both. The rounding line is deliberately _not_ unsigned: flooring toward minus infinity means it can never be negative, so a sign there would be noise.

**The Farm's share of a loss is its own line.** Every money figure on the sheet is printed unsigned with the label saying which way it went, because `৳-১২,৩৪৫` under a heading that says Profit is how a man reads a loss as a small gain. The first version applied that to the profit and to his own share but left "খামারের অংশ / The Farm's share: ২০,০০০ টাকা" on a losing run — which reads as the Farm taking money out of a run that lost it. It now says the Farm's share **of the loss**. The rounding line is deliberately _not_ unsigned: flooring toward minus infinity means it can never be negative, so a sign there would be noise.

**The herd's four counts each ask whose she was at the moment of the thing they count**, which a review had to point out, and the first version overlapped badly. It picked the animals by who owned them at arrival and then counted every Sale ever recorded against any of them — so a bull the Farm bought back at wind-up and sold on months later landed in "bought back" _and_ in "sold", at a price this Venture never received, and would have landed in "lost" as well had he died under the Farm. A bull sold across to another Venture counted as this run's Sale at the other run's price. Each count now asks the ownership of its own moment: bought at her arrival, sold the day the buyer took her, lost the day she went.

**And "bought" counts what it paid another purse, as the Settlement's own line does.** An Animal taken on by **Internal Sale** was bought with this Venture's money as surely as one off a lorry, and the frozen "Cattle bought" line counts it — a story that left it out would not reconcile with the charge above it.

**"Per Unit: capital in → taka back" was missing**, which the spec and the prototype both name as the line he reads first. Profit per Unit was there; what one Unit put in and what one Unit comes back with was not.

**The herd's story is read from the records, and is headed as such.** Everything else on the sheet was frozen at approval, but bought, sold and their averages come off the Intakes and the Sales — and a **Sale** is the one Correction a settled Venture still allows, being the late news itself. Putting a price right would move the average without moving a taka of the account above it. Rather than freeze a second copy of the herd at approval, the heading says which it is: "পালের হিসাব (নথি অনুযায়ী) / What became of the cattle, as the records stand". The closing note's claim about frozen figures is then true of exactly what it names.

**The Farm's buy-back is an Internal Sale to nobody**, which is what tells it from a bull sold across to another Venture — `fromVentureId` this run, `toVentureId` null.

**An Adjustment's outcome is said, not spelled.** It was printing the stored word — `noted`, `waived` — in English into the middle of a Bangla sheet. It goes through a table exhaustive against the stored outcomes now, so a fifth one fails to compile rather than leaking an enum onto a paper.

## Left as it is, on purpose

**Still no screen**, as with 01, 02 and 04. All three papers are reachable through the API and recorded on the trail; none can be printed. The screens want a ticket of their own.

**An Adjustment line mixes two measures, and a second Adjustment would show it.** `perUnitDifferenceBdt` carries the Adjustments before it as well as its own, while `perUnitPaidBdt` is only what that one sent. On a single Adjustment they agree; on a second, the "up/down" figure restates the first one's movement as though it were this one's. The test raises one. Putting it right means deciding what an Investor should read when three of them land in a year, which is the Owner's to say and not a defect to quietly patch.

**`paidMovementId` now rides in the Settlement's audit snapshots.** `readSettlement` is the before/after of every settlement trail entry and the payload of `approvedSettlement`, so widening it puts movement ids in both. They are the farm's own ids in the farm's own trail, and the alternative was a second read of a row already in hand.
