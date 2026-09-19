# 04 — অগ্রগতি: the paper while the Venture runs

**What to build:** What an Investor is sent while his money is standing in a shed he does not visit: how the animals are doing, and where the money has gone.

On it:

- **The herd, from ticket 03:** head alive and died, average weight at Intake and now, Average Daily Gain, days to the Target Window, and the per-Animal table with tag, photo, Intake weight, latest weight and her own gain.
- **His holding:** his Units and what share of the Venture that is. Not anybody else's.
- **The spend, at Category level:** cattle, feed, medicine and vet, other — against the **Cattle Budget** and the **Running Budget** both, with what is left of each. Never a unit price per kilogramme, never a supplier's name.

The spend is the part that was argued over and kept: an Investor is owed a true account of where his money went, and "trust us" is what the schemes that went wrong all said. The line is drawn at Category level, which tells him the truth without handing him the Farm's buying prices or its suppliers.

**No projection.** The days to the window are a count. There is no projected weight on this paper and no projected price, because he will keep it and read it as a promise.

**Blocked by:** 01 (what a Venture Statement is), 03 (what an Investor's animals are doing)

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 6, user stories 76, 77, 78, 82, 83, 84; [the prototype verdict](../../openfarm-investor-projects/issues/08-prototype-investor-statements.md), document 2; `CONTEXT.md` — **Cattle Budget**, **Running Budget**, **Unit**, **Purse**, **Reimbursement**.

- [~] The paper prints the herd figures, his Units and share, and the spend by Category against both budgets — what is **left** of the Cattle Budget, and what the Running Budget has been **spent** on
- [x] It shows his holding and no other Investor's, and no Investor list
- [x] Spend is at Category level only — no unit price per kilogramme and no supplier name anywhere on it
- [x] No projected weight and no projected price
- [x] It carries the letterhead, the footer and the Export's Audit Event, from ticket 01
- [x] Tests cover a Venture with two Investors, asserting that neither one's paper carries anything of the other's

## Checked before starting

**Most of the reading exists, but for a month rather than for the run.** `ventures.consumption({ ventureId, month })` (`routers/ventures.ts:2262`) already answers what a Venture's Animals consumed in one month, itemised and **named in Bangla and English** — by Feed Item, by drug product, by Money Category. It is built for the monthly **Reimbursement**, and it narrows the costing through `consumedBy(costs, ownedThenBy, ventureId, { from, until })`. Its sibling `chargedTo(costs, ownedThenBy, ventureId)` (`cost-store.ts:651`) is the whole-life version and is what the Settlement uses. The progress paper wants run-to-date, so `chargedTo` is the closer fit; check which of the two the budgets are meant to be read against.

**That reading is finer than this paper may print.** `consumption` names individual Feed Items and drug products. The verdict allows Category level only — "cattle, feed, medicine and vet, other" — so this paper must roll up rather than pass through, and the rolled-up lines should reconcile to the Settlement's frozen `charges` (`{ word, bdt }`, words "bought", "hasil", "trips", "feed", "medicine", "vet", "herd"). Those seven words are the natural grouping and they already agree with the sum an Investor eventually checks. Prefer them to inventing a fourth grouping, and if "other" is wanted, say which of the seven it gathers.

**Two purses, and the paper means both.** A Venture is charged what its own purse paid directly _and_ what the Farm bought for the whole herd and is repaid for through the **Reimbursement**. The costing already covers both — that is what `chargedTo` narrows — so this is a caution rather than a task: do not build a second sum off the Venture's own Money Events alone, which would understate feed and medicine badly. Note also that `consumption` **deliberately leaves out Hasil and Trips** (`cost-store.ts:724`) because a Reimbursement is not about them; a run-to-date sheet wants them.

**The budgets exist but are not reachable for one Venture.** `ventureView` (`venture-store.ts:110`) derives `cattleBudgetBdt`, `runningBudgetBdt`, `cattleBudgetHeldBdt`, `runningBudgetHeldBdt`, `spentBdt`, `cattleOutBdt` and the low-water warning — and the only thing that produces one is `ventures.list` (`routers/ventures.ts:473`), which returns every Venture on the farm. There is no `ventures.get`. The internal `ours(context, id)` returns the raw row, not the view. One Venture's view is this ticket's to expose, and the run-to-date charges can come back with it.

**This is the paper the text format cannot hold, and the ticket must decide how.** Every existing paper is a plain multi-line string, and `<Paper>` (`apps/web/src/components/paper.tsx`) renders that string plus **at most one** image — the Registration record's certificate is the only paper that uses it. A table with a photo in every row is not a string and does not fit. Worse, `animalPassport` carries no photo at all although the Release 1 report set lists one, so the format has never carried an image inside its body. Three ways out, and the ticket picks one rather than discovering it halfway: extend `<Paper>` to take images keyed to the text; build this one sheet as bespoke JSX, as the prototype did, and accept that one paper is not a string; or print the table without photos and hand the photos over another way. The verdict kept the photos deliberately — "an Investor who cannot visit the shed is buying on trust" — so dropping them is a decision to take back to the Owner, not one to make quietly while building.

**The photos themselves are ready.** `animalPhoto` (`db/schema/herd.ts:218`) holds base64 in Postgres, one row per Animal, and `animals.photo({ tagNumber })` (`routers/animals.ts:1040`) serves `{ contentType, data }`. `apps/web/src/components/animal-photo.tsx` shows the render: `src={\`data:${contentType};base64,${data}\`}`, with the query enabled only when `photoUpdatedAt` is set. A sheet of twenty animals means twenty base64 images in one payload — worth a thought about size before it is built.

**Two budgets, spent from separately** (`CONTEXT.md` — **Cattle Budget**): a **Buying Float** comes off the Cattle Budget alone, and what buying does not spend rolls into the Running Budget when buying closes. The "what is left" figures have to respect that roll-over or they will not agree with the Venture's own screen.

## What was decided while building

**The photographs travel beside the sheet, not inside it — the Owner's call, asked before building.** Of the three ways out this ticket named, she took the one that changes nothing: `investorStatements.progress` returns `{ text, photos, agreementId }`, the sheet stays a plain multi-line string like every other paper the farm writes, and `<Paper>` is untouched. Nothing is dropped — an Investor who cannot visit the shed still gets the faces — and how they are laid out is the screen ticket's to decide, which is where that decision belongs. The alternatives both cost something now for a screen that does not exist: extending the shared component all fifteen Release 1 papers render through, or making this one sheet the only paper that is not a string and so the only one that cannot be produced again years later and read the same.

**The spend lines are the Settlement's own seven words, not a fourth grouping.** `whatItWasCharged` came out of `settlementOf` and both now call it, so what an Investor is shown while the run goes on adds up exactly the way what he is shown at the end does — the same words, off the same costing, never a second sum. The prototype's "cattle, feed, medicine and vet, other" is those seven read aloud; inventing a mapping between them would have been one more place for the two sheets to drift apart, and "other" would have had to say which of the seven it gathered.

**`budgetsOf` came out of `ventureView` for the same reason.** The paper needs four figures — the two budgets and what is left of each — and `ventureView` would only give them alongside bank standing, a wind-up day and a count of standing animals, every one of which it insists on being told and none of which a paper wants. Copying the proportion arithmetic instead is how his sheet and her screen would have come to disagree about what is left to feed the animals with.

**"What is left" is only honest of one of the two budgets, and a review caught the other reading as nonsense.** What the Venture Account holds against the Running Budget is the Owner's screen's answer, and it includes what the Animals have fetched — so once selling starts it says there is more of the running budget left than the budget ever was. True of the account; absurd on a sheet a man keeps. The Cattle Budget's "left" is sound, because it is what came in for buying less what has been drawn against it, and a bull sold across to another Venture properly returns money to that side. So the sheet prints what is left of the Cattle Budget and what keeping the animals has **cost** — a figure he can add up from the seven lines printed directly above it. The criterion is marked partial rather than quietly reworded.

**The share divides by the Units signed for, not the Units the plan offered.** The Settlement divides profit by the signed Units, so a paper dividing by the plan's would promise an under-subscribed Venture's Investor a smaller share than his payout actually pays. Both are the same number in the test's story, which is fully subscribed, so the fix ships without a test that could catch it — worth knowing if anybody touches it.

**The table lists the standing animals.** A man wants to know what is in the shed his money paid for; the ones that have gone are the counts above it, which say how many were sold and how many were lost. Their weights in the table would read as animals he still has.

## Left as it is, on purpose

**The head count and the "cattle bought" line answer different questions, and the sheet does not say so.** A bull the Venture bought and later sold across to another is not in the counts — she is not its animal any more — but the money it paid for her is in what it spent, because it did pay it. Both figures are right; sitting on one page they invite the question "six bulls' worth of money, five head?". Putting her on the sheet as gone-across, or showing what the other Venture paid for her, is a decision about what an Investor should be told rather than a defect, and it is the Owner's to make. Raised rather than guessed at.

**Still no screen.** As with 01 and 02, nothing in increment 6 has a UI criterion, so the sheet and its photographs are reachable through the API and recorded on the trail but nobody can print one. The screens want a ticket of their own, and this one now hands them the photographs to lay out.
