# 04 — Audit Event on every write

**What to build:** Every state change goes through one transactional write helper that also inserts an append-only Audit Event — actor, Role used, device id and sequence (null for personal sessions), `recorded_at` and `received_at`, entity, action, before/after payload — in the same transaction. Facts change only by Correction rows that supersede with a reason; no delete exists. The Owner and Manager can browse the audit log; every other Role sees only their own actions.

**Blocked by:** 03

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 1.

- [ ] Every procedure that writes uses the helper; a lint or test guard fails when a write bypasses it
- [ ] Forcing a failure after the domain row but before the Audit Event leaves neither row (tested)
- [ ] The Audit Event carries actor, role_used, device_id, device_seq, recorded_at, received_at, entity, entity_id, action, before, after
- [ ] A Correction row supersedes a record with a reason and the original stays readable; there is no delete procedure for farm records
- [ ] Owner/Manager see the full log filtered by entity, person and date; Staff and Vet see only their own actions
