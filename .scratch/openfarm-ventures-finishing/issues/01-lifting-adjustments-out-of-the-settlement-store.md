# 01 — Lifting Adjustments out of the Settlement store

**What to build:** Nothing changes for anybody using the farm. The store that holds a Settlement now holds four separate jobs — working the close-out out, reading it back, paying it, and the whole of Settlement Adjustments — and the Adjustment half shares almost nothing with the rest. Move it out before the next two tickets add to it.

A prefactor, and deliberately its own ticket: a mechanical split of a large file is exactly the change that goes wrong when it rides along inside a feature.

**Blocked by:** None — can start immediately.

**Status:** done

- [x] Everything about Settlement Adjustments lives in its own store: what they come to, what must be done about them, raising, closing and reading them back
- [x] The Settlement store keeps the close-out arithmetic, the read model and the payouts
- [x] No behaviour changes and no test changes: the whole suite passes untouched

## What was decided while building

**Named `settlement-adjustment-store`, not `adjustment-store`.** The Stock Count already has an `adjustmentsOf` of its own, and `CONTEXT.md`'s **Settlement Adjustment** entry ends "not a Stock Count's adjustment". Inside the Settlement store the surrounding module supplied the qualifier; a file of its own has to carry it.

**Two doc comments were wrong before the move and were carried across verbatim.** The one naming the Adjustments list had been duplicated and stranded above a private helper, leaving the module's main export with none at all. A mechanical split is the natural habitat of that defect, so it was worth the review looking for it — and the split was the moment to fix it rather than move it.

## Left for later, deliberately

**630 lines is still three jobs.** The next cut is the payouts — what is left to pay, the Venture reaching Settled, and the movement itself — about 130 lines, which would also carry off most of the coupling to the Venture store. Not done here: this ticket said Adjustments, and a second cut in the same change is how a prefactor stops being verifiable.

**`readSettlement` still grafts `adjustments` onto what it returns**, which points the Settlement store at the Adjustment one. There is no cycle today. Composing the two in the router instead would be cheaper insurance against one, but it would drop the Adjustments out of the Settlement's audit snapshot — a real change in what the trail records, in a ticket whose whole promise is that nothing changes. Worth doing on purpose, in its own ticket.
