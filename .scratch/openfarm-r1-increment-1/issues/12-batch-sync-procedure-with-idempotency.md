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

**Review outcomes folded in (follow-up commit).** Both axes found the same worst defect, and between them five more. This one deserved every finding it got:

- **Late entries were dropped while the phone was told they were kept.** ADR 0002 says a late entry is _accepted_ flagged, never dropped — but the flag was raised after the write had already thrown, so nothing was stored. A cow sold at two, a phone syncing at six carrying twelve and a half litres drawn at five: the phone cleared its outbox and the litres existed nowhere. What the phone sent is now held whole on the entry itself, with a person asked what to do with it, and the outcome it reports is **kept** rather than flagged, because "flagged" had come to mean two different things.
- **Writes committed with no Audit Event.** Each entry had no savepoint, so a Completion row written before its effect threw stayed on the transaction and committed with nothing in the trail to account for it — and a real SQL error would have aborted the transaction the rest of the batch was riding on. Every entry now sits in its own savepoint.
- **A replay could put a second person's name on the first person's work.** The upsert rewrote the row whenever the figures matched, so the same entry arriving from a shed phone restamped a Completion recorded on someone's own phone. Nothing is written when the entry is already there.
- **A replayed Move was not idempotent at all** — the Move carried no client id, so it could be recorded twice.
- **Gaps inside a batch were invisible.** Numbers 1 and 3 arriving together reported no gap, because only the run before the batch was checked.
- **A sequence number could be reused silently**, the second entry's herd write landing while its bookkeeping row was discarded.
- One phone with a bad clock sending two hundred entries raised two hundred notices. It is one phone and one thing to look at.

The audit guard was evaded rather than satisfied: `tx.insert` inside a router's own transaction slipped past a rule written for `context.db.insert`. Tightening it to catch both handles flagged every router, because they all write on `tx` _inside_ the audited helper — which is the correct pattern. The rule that actually holds is narrower and now enforced: **a router may not open a transaction**. Transactions belong to the audited helper and to the stores, where the Audit Event is written beside the change; the batch machinery moved into a store accordingly.

Also: the digest column called `request_hash` held the whole payload rather than a hash; `entrySeen` and the batch lookup were not scoped to the Farm; three exported helpers had no callers; and `applyMove` duplicated a Pen check its caller had already made.
