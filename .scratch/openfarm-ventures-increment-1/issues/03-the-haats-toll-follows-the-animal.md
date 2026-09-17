# 03 — The haat's toll follows the animal

**What to build:** When the Manager records an Intake, they also record the Hasil the haat took on that animal, as the haat's slip gives it. It is charged to her alone — never spread across her companions, because a haat takes it per beast and often on her price — and it shows on her page beside her purchase price and comes off her Margin when she sells.

**Blocked by:** 01

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 1, user stories 27, 40; [What a project is charged for](../../openfarm-investor-projects/issues/05-what-a-project-is-charged-for.md); `CONTEXT.md` — **Hasil**, **Intake**.

- [x] An Intake records the Hasil paid on that animal, optional and zero by default, correctable within the ordinary Correction Window with an Audit Event
- [x] The Hasil is charged to that Animal alone and appears on her page and in the per-Side report's Hasil line
- [x] Her Margin and Cost of Gain fall by it; an Animal bred on the Farm has none
- [x] The Hasil is part of what her Intake cost, not a separate Money Event to the haat, and the accountant export shows it as part of the animal's purchase
- [x] Tests cover an Animal with Hasil, one without, and a Correction that changes it

## What was built

**An Intake records the Hasil** the haat took on that beast, optional and zero at a farm-gate sale, put right by a Correction like the price beside it.

**Her arrival's Money Event is what the farm handed over** — the price and the toll together, one event, not two, and a Correction re-prices that same event. The accountant export, the month's summary, her Category and her Side all read the wider figure.

**The toll is hers alone**, charged from the day she came off the lorry, on the Side she stood on then. An animal with no toll, and one born here, carry none — and it never spreads to the bulls that came home on the same lorry.

**Her Margin and Cost of Gain fall by it**, with no double count: what she was bought for stays the price alone, and the toll reaches the sum as its own part.

**On the screens**: the intake form asks for it beside the price and the summary reads it back; her arrival card shows it when there was one, and the correction dialog takes it.

**Caught in review, and fixed:** the correction dialog used the answer kind that refuses nothing, which would have blocked _every_ Intake correction — price and seller included — on the thousands of animals whose toll is zero. A Hasil typed by mistake could never have been put back either.
