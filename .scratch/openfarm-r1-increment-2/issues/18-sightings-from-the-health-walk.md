# 18 — Sightings from the health walk and the heat watch

**What to build:** What Staff notice on the daily round becomes a fact the farm can ask questions of. A Step with a Sighting Effect records that this animal was seen in this condition — bulling, limping, off her feed — by this person at this time, and the animal's page shows her sightings alongside everything else. The Manager can see every animal seen in heat this week without opening an Instance. Increment 3 turns a Sighting into a Diagnosis and increment 5 turns one into a Service; this ticket only has to record it truthfully.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 2 (health walk, heat watch). Confirmed with the Owner 2026-09-11: a durable record now rather than Evidence alone.

- [ ] A Step with a Sighting Effect writes a Sighting from the Step's Evidence, idempotent on the Completion
- [ ] What may be sighted is authored on the Step, in Bangla, and validated at publish like every other choice
- [ ] An Animal's page lists her Sightings, newest first, each naming the Instance and the person
- [ ] A Sighting is correctable and supersedable like any other entry; nothing is deleted
- [ ] Tests cover recording, replay, the animal's view and a correction
