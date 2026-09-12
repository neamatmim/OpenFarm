# 43 — The Service

**What to build:** The cow is served — by a technician with a straw, or by the farm's own bull. The record says which, when, whose semen or which bull, and who did it. It is the event the whole rest of the chain counts from, so it has to be exact about the day.

**Blocked by:** 42

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 5, user story 67; [Breeding and reproduction](../../openfarm-release-1/issues/11-breeding-and-reproduction.md) (step 2); [Roles matrix](../../openfarm-release-1/assets/roles-matrix.md) — Breeding row.

- [ ] A Service records AI or natural, the date and time, the sire (a straw's identity, or the farm's bull by Tag Number), and who served her
- [ ] It is the Manager's and the Vet's to record; Barn Staff may record one only as a Step of the AI SOP, in their own pens
- [ ] A Service closes the AI work the Heat raised, so nobody is sent to serve a cow who has been served
- [ ] Her page reads as a chain: the Heat, the Service it led to, and what followed
- [ ] Tests cover an AI service, a natural one, the AI work closing, and a milker being refused outside the SOP
