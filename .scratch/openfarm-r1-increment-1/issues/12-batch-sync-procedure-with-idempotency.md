# 12 — Batch sync procedure with idempotency

**What to build:** A single oRPC procedure accepts a batch of entries (Completions, Moves, Observations placeholder) plus one idempotency key and applies them with their Audit Events in one transaction. Entries carry client-generated UUIDv7 ids, `(device_id, seq)`, `recorded_at` and the active user; the server stamps `received_at`. A replay with the same key returns the stored response and inserts nothing. Gaps in a device's sequence and clock skew beyond a threshold are flagged, never rejected. An entry that no longer fits current state (animal since moved or exited, duplicate Completion) is accepted with Needs Review and a reason; malformed, unauthorised or unknown-animal entries are rejected individually with a reason so the client can keep them. Idempotency keys are retained for weeks. (ADR 0002.)

**Blocked by:** 09

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 1.

- [ ] A batch either applies fully or not at all; its Audit Events are in the same transaction
- [ ] Replaying the same idempotency key returns the stored response; a different payload under the same key is refused
- [ ] Duplicate record ids are no-ops; `(device_id, seq)` is unique and gaps are recorded as flags
- [ ] Both clocks are stored; the client can never set `received_at`
- [ ] Late entries against a changed world are stored with review_status = needs_review and a reason; malformed/unauthorised/unknown-animal entries return per-entry rejections
- [ ] A 401 (expired session) rejects the whole batch without side effects so the client can pause and re-authenticate
- [ ] Tests through the primary seam cover all of the above, including a device-session batch whose active user is not enrolled
