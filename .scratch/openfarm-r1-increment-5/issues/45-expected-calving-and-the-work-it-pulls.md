# 45 — Expected Calving, and the work it pulls towards it

**What to build:** Once the farm knows when she is due, two pieces of work are owed before she calves: drying her off sixty days out, and preparing her seven days out. Both are counted backwards from a date the farm worked out, which is a thing the Playbook cannot yet express — a Trigger today counts forward from something that happened.

Two decisions from the Owner, 2026-09-13. **If the date moves, the work moves with it**: work still open goes to the new day, work already done stays done, and the trail says why the day changed. And **a heifer bought in already pregnant is asked for her due date at intake**, on the one screen where somebody knows the answer, so everything downstream works for her exactly as for a home-bred cow.

**Blocked by:** 44

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 5, user stories 69 and 70; [Breeding and reproduction](../../openfarm-release-1/issues/11-breeding-and-reproduction.md) (steps 4 and 5, and the Consequences note on event-relative triggers).

- [ ] The Playbook can say "so many days before an Animal's Expected Calving", and the dry-off and calving-prep SOPs are written that way with the decided leads
- [ ] Drying her off puts her in Dry; calving-prep moves her to the calving Pen
- [ ] When her Expected Calving moves, work still open moves with it and work already done is left alone; the trail records the move and its reason
- [ ] A heifer registered as already pregnant is asked when she is due, and the same work is raised for her
- [ ] Tests cover both SOPs falling due at their leads, a date moving open work but not finished work, and a bought-in pregnant heifer getting the same treatment as a home-bred cow
