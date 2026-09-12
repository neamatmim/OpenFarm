# 44 — The Pregnancy Check

**What to build:** Forty-five days after a Service the farm asks the Vet to check her. A positive check is the moment she is carrying: it sets her Expected Calving at the service date plus the gestation, and a heifer becomes a Pregnant Heifer. A negative check sends her back to heat watch and counts the service as failed — which is what the Repeat Breeder flag will later be counting.

Three Owner decisions from 2026-09-13, after ticket 43's review, each change this ticket:

- **The farm sometimes serves a cow twice in one heat** — AI at twelve hours and again at twenty-four.
  Every service is recorded, and they are **one attempt**: the Pregnancy Check falls due from the
  heat's first service, and a heat whose services did not take is one failure, not two — or she is
  a Repeat Breeder a whole cycle early.
- **A Service asks when she was served**, filled in with now and changed only when it is written up
  late. Every date in this ticket counts from that day, and a Correction can put a wrong day right.
- **A Service may be recorded from a Shed Phone.** Parentage is attributed to the Manager whichever
  phone it came through, and the trail says which device.

**Blocked by:** 43

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 5, user story 68; [Breeding and reproduction](../../openfarm-release-1/issues/11-breeding-and-reproduction.md) (step 3).

- [ ] A Service asks the date and time she was served, defaulting to now; it may not be in the future, and a Correction can change it
- [ ] Two services in one heat are both recorded and are one attempt
- [ ] The Pregnancy Check SOP falls due the decided number of days after a heat's first Service — once per attempt, not once per service — and it is the Vet's
- [ ] A positive check sets Expected Calving from the service date and the gestation, both Farm Parameters; a heifer reaches Pregnant Heifer
- [ ] A negative check clears nothing she has, returns her to heat watch, and records the service as failed
- [ ] Nothing about a pregnancy is a typed date: Expected Calving is derived and re-derived, never entered here
- [ ] Tests cover a service written up late carrying its real day, two services in one heat raising one check and counting as one attempt, the check falling due, a positive setting the date and the State, a negative counting the failure, and a milker being refused
