# 01 — Costs carry their new parts, all at zero

**What to build:** The Owner opens an animal's page and the per-Side money report and sees three new lines beside feed, medicine and the vet — the Hasil paid on her, her share of the Trips that moved her, and her share of the Herd Costs — each reading ৳0 because nothing fills them yet. Margin, Cost of Gain and Cost per Litre already subtract them, so when the next four tickets start filling them, every screen and report is right without further change.

This is a prefactor: one change to the shape everything costed shares, no change to behaviour. Make the change easy, then make the easy change.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 1, user stories 39, 50; [What a project is charged for](../../openfarm-investor-projects/issues/05-what-a-project-is-charged-for.md); `CONTEXT.md` — **Margin**, **Hasil**, **Buying Trip**, **Selling Trip**, **Herd Cost**.

- [ ] What an Animal costs carries three more parts — Hasil, Trip shares and Herd Cost shares — beside feed, medicine and the vet, and what is spent on her adds all six
- [ ] Margin, Cost of Gain and Cost per Litre read the wider sum; with the new parts empty, every existing figure is unchanged to the poisha
- [ ] The animal's page and the per-Side report show the three new lines, in Bangla with their English labels, reading zero
- [ ] Barn Staff and the Vet still see none of it
- [ ] Existing cost tests pass untouched; one new test asserts an animal with no Hasil, no Trip and no Herd Cost has the Margin she had before
