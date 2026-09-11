# 12 — Batch sync procedure with idempotency

**What to build:** A single oRPC procedure accepts a batch of entries (Completions, Moves, Observations placeholder) plus one idempotency key and applies them with their Audit Events in one transaction. Entries carry client-generated UUIDv7 ids, `(device_id, seq)`, `recorded_at` and the active user; the server stamps `received_at`. A replay with the same key returns the stored response and inserts nothing. Gaps in a device's sequence and clock skew beyond a threshold are flagged, never rejected. An entry that no longer fits current state (animal since moved or exited, duplicate Completion) is accepted with Needs Review and a reason; malformed, unauthorised or unknown-animal entries are rejected individually with a reason so the client can keep them. Idempotency keys are retained for weeks. (ADR 0002.)

**Blocked by:** 09

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 1.

- [x] A batch either applies fully or not at all; its Audit Events are in the same transaction
- [x] Replaying the same idempotency key returns the stored response; a different payload under the same key is refused
- [x] Duplicate record ids are no-ops; `(device_id, seq)` is unique and gaps are recorded as flags
- [x] Both clocks are stored; the client can never set `received_at`
- [x] Late entries against a changed world are stored with review_status = needs_review and a reason; malformed/unauthorised/unknown-animal entries return per-entry rejections
- [x] A 401 (expired session) rejects the whole batch without side effects so the client can pause and re-authenticate
- [x] Tests through the primary seam cover all of the above, including a device-session batch whose active user is not enrolled

**How it was built.** The batch needed the single-entry write to be something it could call inside a transaction it already held, so the Completion and Move writes came out of their routers into a store both use. `audited()` grew `recordEvent`, which writes one Audit Event on the caller's transaction: `write` is the way in for a single change, and this is the way in for a batch, where many changes and their events share one transaction and opening a transaction each would defeat the point.

Decisions worth remembering:

- **A refusal is not a failure.** The batch is one transaction, but an entry the farm cannot accept is answered on its own account and the rest still applies: one malformed entry is no reason to lose a morning's milking. What rolls the whole thing back is the things that should — an expired session, a database that will not take the write.
- **A changed world is not a wrong entry**, and the difference is marked rather than guessed. An animal sold since the entry was written, work signed off since, a cow already recorded: these were true when the phone wrote them, so they are kept and put in front of the Manager. A Step no Version has, a tag the farm has never had: those go back to the phone, which keeps them so somebody can see what was meant.
- **The batch key is the client's**, and it is reserved in the transaction before anything is applied, so two phones replaying the same batch at once meet there rather than both applying it. The same key with different entries is refused rather than answered with someone else's result.
- **The record's id is the client's too.** An entry replayed under a new batch key is recognised as the same fact, not written a second time.
- **The sequence belongs to the source** — the Shed Phone, or the person on their own phone — and it is a non-null column, because Postgres treats NULLs as distinct and a unique index over a nullable device would not hold.
- **Gaps and clock skew are said, never enforced.** Entries the farm has never read are a notice for the Manager; a phone whose clock is a day out still recorded the litres, and the litres are the record.
- Observations have no home until health arrives, so the kind exists in the contract and is refused by name. A client written against this does not have to change when increment 3 lands.

Retention is the whole of Release 1's answer: nothing is purged, so keys and sequences outlive any phone's time out of signal by a wide margin.
