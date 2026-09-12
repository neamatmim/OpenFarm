# 46 — Calving

**What to build:** She calves. The record says when, how it went, and what was born — and the farm does the rest: she goes to Milking and her next Lactation begins, and the calf becomes an animal with the next `D-` number of her own. Twins are one calving and two calves. A stillborn calf is still created and immediately exits, because a calving history with a gap in it is not a calving history.

**Blocked by:** 45

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 5, user story 70; [Breeding and reproduction](../../openfarm-release-1/issues/11-breeding-and-reproduction.md) (step 6); [Animal lifecycle and groups](../../openfarm-release-1/issues/04-animal-lifecycle-and-groups.md); [Milk recording](../../openfarm-release-1/issues/09-milk-recording.md) (Lactation numbering).

- [ ] A Calving records the date, the ease (unassisted, assisted, vet), and for each calf its sex and whether it was born alive
- [ ] The dam reaches Milking and her Lactation number goes up by one, dated from the calving; days-in-milk follows from it without anybody typing a thing
- [ ] Each calf is created with the next `D-` number and stands in the dam's Pen; a stillborn one is created and exits as Died in the same act
- [ ] Twins are one Calving with two calves, not two Calvings
- [ ] The dam and the calf can each be read back to the other, so a cow's page says what she has produced
- [ ] Tests cover a live single calving, twins, a stillbirth, the Lactation starting, and the calf carrying her own number
