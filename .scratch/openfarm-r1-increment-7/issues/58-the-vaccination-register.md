# 58 — The vaccination register

**What to build:** Which animals were vaccinated against what, when, from which batch, and by whom — the register an inspector reads for FMD and anthrax. A product on the Drug List can be marked as a vaccine. A vaccination campaign asks the vaccinator for the batch once for the Pen's run, and it applies to every dose in that run; a dose from a different batch can say so on that animal (the Owner's decision, 2026-09-13). The vaccination register (R3) lists every vaccine dose in a window in the DLS guideline's order, joins the Inspector View, and prints and exports as CSV.

**Blocked by:** 56

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 7, user story 96; [Report set](../../openfarm-release-1/assets/report-set.md) — R3; [Health model](../../openfarm-release-1/issues/08-health-medicine-and-withdrawal.md) (campaigns); `CONTEXT.md` — **Drug List**, **Campaign**, **Treatment**.

- [ ] The Vet marks a Drug List product as a vaccine
- [ ] A campaign with a vaccine records the batch once for its run, applied to every dose; one animal's dose can carry its own batch; a Correction can put a batch right
- [ ] R3 lists per animal: vaccine, date, batch, who gave it — in the DLS guideline's order, for any window
- [ ] In the Inspector View, as paper and CSV, each an Export
- [ ] Tests cover a campaign run's batch, one animal's own batch, a corrected batch, a non-vaccine dose left off, and the Export
