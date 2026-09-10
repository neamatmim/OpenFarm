# Offline capture and sync decision

Status: resolved

Type: grilling

Blocked by: 03, 05

Map: [OpenFarm Release 1](../map.md)

## Question

**Grilling.** Read [Offline-first capture options](./03-offline-capture-options.md) and the SOP model. Decide:

- Which approach (hand-rolled queue vs sync engine vs other) — and whether it forces a stack change.
- What works offline: SOP execution and record capture (yes); viewing which data (today's tasks, the animal list, last known state)? Anything online-only?
- Conflict rules: two people completing the same step; an entry against an animal that was sold meanwhile.
- Idempotency and ordering guarantees the audit trail needs.
- Packaging: PWA vs wrapped app.

Resolved when the approach, offline scope, and conflict rules are written down. Offer an ADR — this is hard to reverse.

## Answer

Decided with the Owner on 2026-09-10, on the basis of [Offline-first capture options](./03-offline-capture-options.md) (branch `research/offline-capture`).

### Approach — outbox on the existing stack; **no stack change**

- **Client**: TanStack DB collections + `@tanstack/offline-transactions` — durable outbox written _before_ the optimistic apply, FIFO, exponential backoff with jitter, leader election across tabs, one `idempotencyKey` per transaction, `NonRetriableError` for permanent rejections. TanStack DB is beta; **pin exact versions**.
- **Write path**: **oRPC stays the only write path.** A batch procedure accepts an array of entries + one idempotency key and applies them in **one Drizzle transaction** together with the audit rows. Photos are separate idempotent uploads keyed by record id + slot, downscaled on-device.
- **Identity & dedupe**: **client-generated UUIDv7** ids (Postgres 18 `uuidv7()` server-side); `INSERT … ON CONFLICT (id) DO NOTHING`. An `idempotency_keys` table (key, user, fingerprint, status, stored response) replays the stored response on retry; keys kept for **weeks**, not 24 h, because a phone can be offline for days.
- **Ordering & attribution**: every entry carries `(deviceId, seq)`; the server indexes it uniquely and flags gaps rather than rejecting out-of-order rows. **Two clocks stored**: `recorded_at` (device, farm semantics) and `received_at` (server, audit order); skew beyond a threshold is flagged. The actor is the **Better Auth session at capture**, stored as `recorded_by`; on 401 the queue **pauses and prompts login** — entries are never dropped.

### Offline scope

- **Works offline**: claim and complete SOP instances; all step evidence including photos; moves; observations.
- **Readable offline**: today's instances, and for the user's **assigned Pens** — animals, State, **withdrawal status**, photos — cached at last sync. **Gates use last-synced state**; a banner shows sync age and the pending-entry count.
- **Online-only**: SOP authoring/publishing, finance, reports & exports, **Vet diagnosis & prescription**, user admin. (The remote Vet therefore needs signal, which matches how a phone consult works.)

### Late entries & conflicts

- An entry is **an event that happened at `recorded_at`**, not a command against current state. If the world changed meanwhile (animal sold/died/moved, dose already recorded, weight out of range) the server **accepts it flagged `needs_review` with a reason** for the Manager to resolve.
- **Rejected only** when malformed, unauthorised, or the animal id is unknown — rejected entries **stay on the phone** with their data for re-entry.
- **Corrections** to existing records carry `expected_version`; on mismatch the attempt is stored as a **conflict record** for a human — never an overwrite.

### Packaging

**Installed PWA** on Android Chrome / Samsung Internet: `navigator.storage.persist()` requested, camera via `<input capture>`, same-origin Better Auth cookies. The in-page outbox is the source of truth; a Workbox background-sync queue replays the same idempotent requests as belt-and-braces. **Capacitor only if storage eviction is observed in practice**; Expo is not on the table (UI rewrite).

### Assumed — correct me if wrong

- Staff phones are Android with Chrome or Samsung Internet (Firefox/Safari lack Background Sync; capture still works, just without SW replay).
- Reference data (assigned pens' animals) refreshes on app open and every sync; no periodic background pull in R1.

### ADR

Meets all three tests. Written: [`docs/adr/0002-offline-outbox-with-orpc-as-the-only-write-path.md`](../../../docs/adr/0002-offline-outbox-with-orpc-as-the-only-write-path.md).

Unblocks → [Notification channels](./23-notification-channels.md).
