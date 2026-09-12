# 44 — The Pregnancy Check

**What to build:** Forty-five days after a Service the farm asks the Vet to check her. A positive check is the moment she is carrying: it sets her Expected Calving at the service date plus the gestation, and a heifer becomes a Pregnant Heifer. A negative check sends her back to heat watch and counts the service as failed — which is what the Repeat Breeder flag will later be counting.

**Blocked by:** 43

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 5, user story 68; [Breeding and reproduction](../../openfarm-release-1/issues/11-breeding-and-reproduction.md) (step 3).

- [ ] The Pregnancy Check SOP falls due the decided number of days after a Service, and it is the Vet's
- [ ] A positive check sets Expected Calving from the service date and the gestation, both Farm Parameters; a heifer reaches Pregnant Heifer
- [ ] A negative check clears nothing she has, returns her to heat watch, and records the service as failed
- [ ] Nothing about a pregnancy is a typed date: Expected Calving is derived and re-derived, never entered here
- [ ] Tests cover the check falling due, a positive setting the date and the State, a negative counting the failure, and a milker being refused
