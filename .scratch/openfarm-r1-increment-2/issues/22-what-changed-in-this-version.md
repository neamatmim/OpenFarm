# 22 — What changed in this Version

**What to build:** When the Owner publishes a new Version, the Staff who do that work are told, and the first time each of them opens the SOP they are shown what is different from the Version they were working to — added Steps, changed numbers, removed Evidence — in Bangla, before they start. Nobody follows the old procedure because nobody told them.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 2, user story 93.

- [ ] Publishing raises an Alert for the people whose Role the SOP is assigned to
- [ ] The first open after publication shows what changed, as differences a person can read, not a JSON diff
- [ ] Acknowledging is recorded, so the notice does not reappear for ever and the farm can show who saw it
- [ ] An in-flight Instance still runs on the Version it started on, and says so
- [ ] Tests cover publishing, the first open, the second open, and an Instance that predates the change
