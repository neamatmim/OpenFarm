# 07 — Settlement Adjustments

**What to build:** Something always arrives late — a Correction to a Sale, a vet's bill that was in a pocket, a cost nobody had entered. Once a Settlement is approved, none of it reopens the settlement: money already paid is not chased, and figures an Investor has been shown do not move. It becomes a **Settlement Adjustment** instead: what changed, what each Investor's figures would now be, and what was done about it.

Above a figure the Owner sets it needs doing something about — a supplementary payout, or a waiver she records and stands behind. Below it, it is noted and nothing moves, because a hundred taka should not cost a trip to the bank. And a Correction attempted on a settled Venture's records is refused in words that say to raise an Adjustment rather than leaving somebody to guess why the farm said no.

**Blocked by:** 06

**Status:** ready-for-agent

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 5, user stories 71, 72, 73; `CONTEXT.md` — **Settlement Adjustment**, **Settlement**, **Correction Window**.

- [ ] A Correction to a settled Venture's records is refused, in words that say to raise an Adjustment
- [ ] An Adjustment records what changed, the revised per-Investor figures, and whether it was paid, waived or only noted
- [ ] A Farm Parameter sets the figure above which an Adjustment must be paid or waived, and the Owner can turn it
- [ ] Below that figure it is noted and nothing moves; above it, it stays outstanding until a supplementary payout is recorded or a waiver is
- [ ] An Adjustment never changes the Settlement's own frozen figures
- [ ] A Venture's settlement record — the Settlement, its payouts, its acknowledgements and its Adjustments — is never deleted
- [ ] Tests cover a Correction refused after approval, an Adjustment below the figure, one above it paid, one above it waived, and the frozen figures staying frozen through all of them
