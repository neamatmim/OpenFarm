# Offline-first capture options on the OpenFarm stack

Status: resolved

Type: research

Blocked by: —

Map: [OpenFarm Release 1](../map.md)

## Question

**AFK research.** Findings go on branch `research/offline-capture` at `docs/research/offline-capture.md`.

Barn staff will record on phones with mobile data that drops inside the barns. The app is a TanStack Start (React 19) app with oRPC v2 (`2.0.0-beta.35`), TanStack Query 5, Drizzle ORM 1.0 rc + PostgreSQL, Better Auth, deployed cloud-side via Nitro. The stack is _preferred but open_ if a decision demands it.

Survey the realistic options for **queue-locally, sync-when-online** capture of form-style records (SOP step completions with timestamps, milk yields, weights, treatments) and evaluate each against primary sources (official docs, source):

1. Hand-rolled: TanStack Query `onlineManager` + persisted mutation queue (`persistQueryClient`, IndexedDB) + oRPC batching. What does it cover, what does it not (conflicts, ordering, idempotency)?
2. Sync engines compatible with Postgres/Drizzle: **TanStack DB**, **ElectricSQL**, **PowerSync**, **Replicache/Zero**, **Triplit**, others actively maintained as of 2026. For each: licensing/cost, hosting requirements, how it fits (or fights) oRPC + Drizzle, conflict model, auth integration, maturity.
3. Packaging: PWA vs Capacitor/Expo wrapper — what's needed for reliable background sync and camera/photo evidence on Android (dominant in Bangladesh).
4. Idempotency & conflict handling patterns for append-mostly records with server-assigned audit trail.

End with a comparison table and a recommendation ranked by fit for _this_ stack and a 100–500 head single farm, plus what would change if the stack were allowed to change.

## Answer

Findings: `docs/research/offline-capture.md` on branch **`research/offline-capture`** (commit `12c2b23`). Read with `git show research/offline-capture:docs/research/offline-capture.md`.

**Ranked recommendation**

1. **Outbox on the existing stack** — TanStack DB query collections + `@tanstack/offline-transactions` (outbox-first, FIFO, backoff+jitter, per-transaction `idempotencyKey`, leader election, `NonRetriableError`), writes through oRPC into idempotent Drizzle inserts keyed by client UUIDv7; shipped as an installed PWA with `navigator.storage.persist()`. Workbox background-sync only as best-effort replay. Smallest change that meets the requirements; oRPC stays the only write path so Better Auth attribution and the audit trail are untouched. Caveat: `@tanstack/db` core is labelled beta.
2. **Same design hand-rolled on TanStack Query** (persisted paused mutations + `setMutationDefaults`) — zero new deps, but you rebuild ordering, idempotency and durable-before-apply yourself.
3. **PowerSync** — best true-offline engine, Postgres-native, server-authoritative, keeps oRPC/Drizzle/Better Auth as the write path via `uploadData()`; costs a sync service, a second SQLite-typed schema, a bucket-storage DB, and an FSL licence. Over-engineered unless rich offline _reads_ across the herd are needed.
4. **ElectricSQL + TanStack DB** — read-path only, Apache-2.0, cheap; add later only if live shared reads become a need.

**Excluded with sources**: Zero (rejects offline writes by design), Replicache (maintenance mode), Triplit (AGPL, own DB, stale), Jazz/LiveStore (replace Postgres), Instant (sunsetting 2027-08-31).

**If the stack could change**: Capacitor + `@capacitor-community/sqlite` for storage durability and camera UX (not true background sync); Expo only as a deliberate React Native rewrite.

**Unverified**: Chromium Background Sync retry constants; whether TanStack DB's offline executor rolls back optimistic state on `NonRetriableError`; Jazz licence; no official Better Auth + Capacitor guidance exists.

Feeds → [Offline capture and sync decision](./17-offline-capture-and-sync-decision.md).
