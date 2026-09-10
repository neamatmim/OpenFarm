---
status: accepted
date: 2026-09-10
---

# Offline capture is an on-device outbox; oRPC remains the only write path

Barn Staff record on Android phones that lose signal inside the sheds, and every record must land in an attributed audit trail. We decided to keep the existing stack (TanStack Start, oRPC, Drizzle/Postgres, Better Auth) and add an outbox on the device — TanStack DB with `@tanstack/offline-transactions` — that persists each entry before applying it optimistically, sends in FIFO order with backoff, and carries one idempotency key per transaction to a batch oRPC procedure that writes the entries and their audit rows in a single Drizzle transaction. Entries carry client-generated UUIDv7 ids and `(deviceId, seq)`, and both the device time and the server receipt time are stored. We rejected a sync engine (PowerSync, ElectricSQL) because it would add a second schema, a sync service and a licence for offline _reads_ we don't need at one farm; we rejected Zero, Replicache, Triplit, Jazz, LiveStore and Instant because they either forbid offline writes, are unmaintained, or replace Postgres as the source of truth.

**Consequences**: the server never trusts a client timestamp for audit order; idempotency keys are retained for weeks, not hours, because a phone can be offline for days; a late entry that no longer matches current state is accepted flagged `needs_review`, never dropped and never overwriting; corrections carry an expected version and become a conflict record on mismatch; anything that needs current server truth (SOP authoring, finance, reports, Vet prescribing, user admin) is online-only by design. The app ships as an installed PWA; a Capacitor wrapper is the fallback if storage eviction is observed, and it would not change this decision.

Decided on the wayfinder map: `.scratch/openfarm-release-1/issues/17-offline-capture-and-sync-decision.md`; evidence on branch `research/offline-capture`.
