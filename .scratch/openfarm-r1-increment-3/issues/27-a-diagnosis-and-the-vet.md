# 27 — A Diagnosis, and the Vet who makes it

**What to build:** The Vet records a Diagnosis on one animal, from their own phone, wherever they are — antibiotics need a registered practitioner's prescription, so the act is legally theirs and nobody records it for them. It reads back as one chain: what the round saw, what the Vet made of it, and what was done. The Vet is off-site more often than on it, so their way in has to work from outside the farm.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 3, user stories 49 and 50; [Health, medicine and withdrawal](../../openfarm-release-1/issues/08-health-medicine-and-withdrawal.md) ("Vet off-site").

- [ ] Only a Vet may record a Diagnosis; there is no recording it on somebody else's behalf, and the refusal says why
- [ ] A Diagnosis may answer an Observation, so the animal's page reads as one chain rather than two lists
- [ ] The Vet reaches the farm from their own phone, off-site, and sees what they need and nothing else
- [ ] A Diagnosis is correctable under the Vet's own correction window, and nothing is deleted
- [ ] Tests cover the Vet recording one, everybody else being refused, the chain on the animal's page, and a correction
