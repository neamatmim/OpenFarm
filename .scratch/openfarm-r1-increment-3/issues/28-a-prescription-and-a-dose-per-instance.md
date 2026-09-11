# 28 — A Prescription, and a dose per Instance

**What to build:** The Vet prescribes for one animal — the product, the dose, the route, how often and for how long — and the farm turns that into work: one Treatment Instance per dose, on the schedule the Vet set. Staff give the dose and record it like any other Step, so a dose nobody gave is Overdue on the same screen as a milking nobody did. That is the whole point of prescribing in the system rather than on paper: the farm can see the course being followed.

**Blocked by:** 26, 27

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 3, user stories 50 and 51.

- [ ] Only a Vet may prescribe, and only a product whose withdrawal days are known
- [ ] A Prescription raises one Instance per dose at the times it calls for, and no more however often anything runs
- [ ] Giving a dose is recorded on the Instance, by whoever gave it, and works offline like every other entry
- [ ] A dose nobody gave goes Overdue with the rest of the day's work
- [ ] Tests cover prescribing, the Instances it raises, a dose given, a dose missed, and a product that may not be prescribed
