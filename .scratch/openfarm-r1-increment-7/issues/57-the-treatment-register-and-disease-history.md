# 57 — The treatment register and the disease history

**What to build:** What an inspector and a slaughter vet ask about first: every treatment of the last thirty days, with the prescription behind it and when the milk and meat are clear, and every diagnosis of the last six months with the notifiable ones marked. The treatment register (R4) follows the DLS guideline's 11-field template in its column order; the disease history (R5) lists diagnoses by date and animal with their outcomes. Either can cover any window. Both join the Inspector View; R4 prints and exports as CSV, R5 prints.

**Blocked by:** 56

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 7, user story 96; [Report set](../../openfarm-release-1/assets/report-set.md) — R4, R5; [Health model](../../openfarm-release-1/issues/08-health-medicine-and-withdrawal.md); `CONTEXT.md` — **Treatment**, **Prescription**, **Diagnosis**, **Withdrawal**, **Notifiable Disease**.

- [ ] R4 lists, per animal and dose in a window (30 days by default): date, diagnosis, drug, dose, route, who gave it, the prescribing Vet, milk and meat withdrawal end — in the DLS template's order; campaign doses appear with no diagnosis or prescriber
- [ ] R5 lists diagnoses in a window (6 months by default) by date and animal, notifiable ones marked with their DLS report reference, and each animal's outcome since
- [ ] Both in the Inspector View; R4 as paper and CSV, R5 as paper; each an Export
- [ ] Tests cover a prescribed course and a campaign dose on R4, the window's edges, a notifiable diagnosis and an outcome on R5, and the Exports
