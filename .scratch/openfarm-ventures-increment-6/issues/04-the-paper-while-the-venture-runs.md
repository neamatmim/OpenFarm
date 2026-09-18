# 04 — অগ্রগতি: the paper while the Venture runs

**What to build:** What an Investor is sent while his money is standing in a shed he does not visit: how the animals are doing, and where the money has gone.

On it:

- **The herd, from ticket 03:** head alive and died, average weight at Intake and now, Average Daily Gain, days to the Target Window, and the per-Animal table with tag, photo, Intake weight, latest weight and her own gain.
- **His holding:** his Units and what share of the Venture that is. Not anybody else's.
- **The spend, at Category level:** cattle, feed, medicine and vet, other — against the **Cattle Budget** and the **Running Budget** both, with what is left of each. Never a unit price per kilogramme, never a supplier's name.

The spend is the part that was argued over and kept: an Investor is owed a true account of where his money went, and "trust us" is what the schemes that went wrong all said. The line is drawn at Category level, which tells him the truth without handing him the Farm's buying prices or its suppliers.

**No projection.** The days to the window are a count. There is no projected weight on this paper and no projected price, because he will keep it and read it as a promise.

**Blocked by:** 01 (what a Venture Statement is), 03 (what an Investor's animals are doing)

**Status:** ready-for-agent

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 6, user stories 76, 77, 78, 82, 83, 84; [the prototype verdict](../../openfarm-investor-projects/issues/08-prototype-investor-statements.md), document 2; `CONTEXT.md` — **Cattle Budget**, **Running Budget**, **Unit**, **Purse**, **Reimbursement**.

- [ ] The paper prints the herd figures, his Units and share, and the spend by Category against both budgets with what is left of each
- [ ] It shows his holding and no other Investor's, and no Investor list
- [ ] Spend is at Category level only — no unit price per kilogramme and no supplier name anywhere on it
- [ ] No projected weight and no projected price
- [ ] It carries the letterhead, the footer and the Export's Audit Event, from ticket 01
- [ ] Tests cover a Venture with two Investors, asserting that neither one's paper carries anything of the other's

## Checked before starting

**Most of the reading exists, but for a month rather than for the run.** `ventures.consumption({ ventureId, month })` (`routers/ventures.ts:2262`) already answers what a Venture's Animals consumed in one month, itemised and **named in Bangla and English** — by Feed Item, by drug product, by Money Category. It is built for the monthly **Reimbursement**, and it narrows the costing through `consumedBy(costs, ownedThenBy, ventureId, { from, until })`. Its sibling `chargedTo(costs, ownedThenBy, ventureId)` (`cost-store.ts:651`) is the whole-life version and is what the Settlement uses. The progress paper wants run-to-date, so `chargedTo` is the closer fit; check which of the two the budgets are meant to be read against.

**That reading is finer than this paper may print.** `consumption` names individual Feed Items and drug products. The verdict allows Category level only — "cattle, feed, medicine and vet, other" — so this paper must roll up rather than pass through, and the rolled-up lines should reconcile to the Settlement's frozen `charges` (`{ word, bdt }`, words "bought", "hasil", "trips", "feed", "medicine", "vet", "herd"). Those seven words are the natural grouping and they already agree with the sum an Investor eventually checks. Prefer them to inventing a fourth grouping, and if "other" is wanted, say which of the seven it gathers.

**Two purses, and the paper means both.** A Venture is charged what its own purse paid directly _and_ what the Farm bought for the whole herd and is repaid for through the **Reimbursement**. The costing already covers both — that is what `chargedTo` narrows — so this is a caution rather than a task: do not build a second sum off the Venture's own Money Events alone, which would understate feed and medicine badly. Note also that `consumption` **deliberately leaves out Hasil and Trips** (`cost-store.ts:724`) because a Reimbursement is not about them; a run-to-date sheet wants them.

**The budgets exist but are not reachable for one Venture.** `ventureView` (`venture-store.ts:110`) derives `cattleBudgetBdt`, `runningBudgetBdt`, `cattleBudgetHeldBdt`, `runningBudgetHeldBdt`, `spentBdt`, `cattleOutBdt` and the low-water warning — and the only thing that produces one is `ventures.list` (`routers/ventures.ts:473`), which returns every Venture on the farm. There is no `ventures.get`. The internal `ours(context, id)` returns the raw row, not the view. One Venture's view is this ticket's to expose, and the run-to-date charges can come back with it.

**This is the paper the text format cannot hold, and the ticket must decide how.** Every existing paper is a plain multi-line string, and `<Paper>` (`apps/web/src/components/paper.tsx`) renders that string plus **at most one** image — the Registration record's certificate is the only paper that uses it. A table with a photo in every row is not a string and does not fit. Worse, `animalPassport` carries no photo at all although the Release 1 report set lists one, so the format has never carried an image inside its body. Three ways out, and the ticket picks one rather than discovering it halfway: extend `<Paper>` to take images keyed to the text; build this one sheet as bespoke JSX, as the prototype did, and accept that one paper is not a string; or print the table without photos and hand the photos over another way. The verdict kept the photos deliberately — "an Investor who cannot visit the shed is buying on trust" — so dropping them is a decision to take back to the Owner, not one to make quietly while building.

**The photos themselves are ready.** `animalPhoto` (`db/schema/herd.ts:218`) holds base64 in Postgres, one row per Animal, and `animals.photo({ tagNumber })` (`routers/animals.ts:1040`) serves `{ contentType, data }`. `apps/web/src/components/animal-photo.tsx` shows the render: `src={\`data:${contentType};base64,${data}\`}`, with the query enabled only when `photoUpdatedAt` is set. A sheet of twenty animals means twenty base64 images in one payload — worth a thought about size before it is built.

**Two budgets, spent from separately** (`CONTEXT.md` — **Cattle Budget**): a **Buying Float** comes off the Cattle Budget alone, and what buying does not spend rolls into the Running Budget when buying closes. The "what is left" figures have to respect that roll-over or they will not agree with the Venture's own screen.
