# 07 — Settlement Adjustments

**What to build:** Something always arrives late — a Correction to a Sale, a vet's bill that was in a pocket, a cost nobody had entered. Once a Settlement is approved, none of it reopens the settlement: money already paid is not chased, and figures an Investor has been shown do not move. It becomes a **Settlement Adjustment** instead: what changed, what each Investor's figures would now be, and what was done about it.

Above a figure the Owner sets it needs doing something about — a supplementary payout, or a waiver she records and stands behind. Below it, it is noted and nothing moves, because a hundred taka should not cost a trip to the bank. And a Correction attempted on a settled Venture's records is refused in words that say to raise an Adjustment rather than leaving somebody to guess why the farm said no.

**Blocked by:** 06

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 5, user stories 71, 72, 73; `CONTEXT.md` — **Settlement Adjustment**, **Settlement**, **Correction Window**.

- [~] A Correction to a settled Venture's records is refused, in words that say to raise an Adjustment
- [x] An Adjustment records what changed, the revised per-Investor figures, and whether it was paid, waived or only noted
- [x] A Farm Parameter sets the figure above which an Adjustment must be paid or waived, and the Owner can turn it
- [x] Below that figure it is noted and nothing moves; above it, it stays outstanding until a supplementary payout is recorded or a waiver is
- [x] An Adjustment never changes the Settlement's own frozen figures
- [x] A Venture's settlement record — the Settlement, its payouts, its acknowledgements and its Adjustments — is never deleted
- [x] Tests cover a Correction refused after approval, an Adjustment below the figure, one above it paid, one above it waived, and the frozen figures staying frozen through all of them

## What was decided while building

**Two bugs that moved real money, found by review and proved with failing tests before they were fixed.**

1. **The same good news paid twice.** Each Adjustment restates the whole difference since the Settlement, not just the new news. Paying a second one therefore sent the first's difference again — ৳22,980 went out where ৳6,000 was due. A payout now sends only what earlier *paid* Adjustments have not.
2. **An Adjustment was scoped to the farm, not to the Settlement.** Venture A's Adjustment paid through Venture B's id would have paid A's per-Unit figure times B's Units. Now scoped to the Settlement it was raised against.

**Only news that leaves the Investors better off is ever outstanding.** The first version judged on the absolute difference, so a large *downward* one waited to be dealt with — and then refused to be paid, leaving a waiver as its only exit. Money already paid is never chased, so there was nothing to decide: a downward difference is noted and closed where it stands.

**A supplementary payout is one Money Event per Investor, named**, on the Farm's own books. The Venture Account closed when the Settlement was paid out, so this is the Farm making good; but one event for the whole act would have left nobody able to answer "what did he get, and on what reference", which is the very gap the Settlement's own payouts were built to close.

## Left undone, honestly

**Criterion 1 is partly met, not met.** A Correction to a settled Venture is refused for its **Venture Movements**, its **Intakes** (her price, her Hasil, whose she is) and its **Buying Trips** — the three that feed a Settlement's figures most directly — through a new `ventureOf` hook on the Correction framework. A **Sale** is a deliberate, documented exception: it is the late news itself, and refusing it would leave what a buyer really paid nowhere to land. But the other correction kinds — Selling Trips, doses, diagnoses, step completions, money entered by hand and charged to the animals, mortality, dispatch — are still allowed on a settled Venture's records and silently move what the costing recomputes. The hook is there; each kind needs its own answer to "whose Venture is this?", and several have no single answer.

**`settlement-store.ts` is now 717 lines doing four jobs** — the settlement arithmetic, the read model, payouts and the whole of Adjustments. The Adjustment half shares nothing but rounding with the rest and wants its own store. Left as it is deliberately: a mechanical split of a large file at the end of a long session is how three functions were deleted earlier in this one.

**No screen, for any of it.** Raising, paying and waiving an Adjustment are API-only, as are the Settlement, its payouts and its acknowledgements. The Owner can see a Venture's money and its wind-up warning and can do nothing at all about closing one out.
