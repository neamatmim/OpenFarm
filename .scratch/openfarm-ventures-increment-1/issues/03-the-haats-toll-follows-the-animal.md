# 03 — The haat's toll follows the animal

**What to build:** When the Manager records an Intake, they also record the Hasil the haat took on that animal, as the haat's slip gives it. It is charged to her alone — never spread across her companions, because a haat takes it per beast and often on her price — and it shows on her page beside her purchase price and comes off her Margin when she sells.

**Blocked by:** 01

**Status:** ready-for-agent

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 1, user stories 27, 40; [What a project is charged for](../../openfarm-investor-projects/issues/05-what-a-project-is-charged-for.md); `CONTEXT.md` — **Hasil**, **Intake**.

- [ ] An Intake records the Hasil paid on that animal, optional and zero by default, correctable within the ordinary Correction Window with an Audit Event
- [ ] The Hasil is charged to that Animal alone and appears on her page and in the per-Side report's Hasil line
- [ ] Her Margin and Cost of Gain fall by it; an Animal bred on the Farm has none
- [ ] The Hasil is part of what her Intake cost, not a separate Money Event to the haat, and the accountant export shows it as part of the animal's purchase
- [ ] Tests cover an Animal with Hasil, one without, and a Correction that changes it
