# Offline-first capture for OpenFarm: options and recommendation

Research date: 2026-09-10. Primary sources only (official docs, GitHub READMEs/licences, pricing pages, npm registry, RFCs). Every claim carries its source inline; anything I could not confirm is listed under "Unverified / open questions".

Context assumed: barn staff on Android phones with mobile data that drops inside barns; form-style, append-mostly records (SOP step completions with timestamps/ticks/numbers/photos, milk yields, weights, treatments); server-side audit trail with attribution; stack is TanStack Start (React 19), oRPC, TanStack Query 5, Drizzle + PostgreSQL, Better Auth, Nitro 3 on a cloud host. One farm, so the device count is small and the data volume is modest.

> Version note. The brief lists oRPC 2.0.0-beta.35, Drizzle 1.0.0-rc.4 and Better Auth 1.7.3. The worktree's `pnpm-workspace.yaml` catalog and `apps/web/package.json` currently pin `@orpc/* ^1.14.12`, `better-auth 1.7.1`, `drizzle-orm ^0.45.2`, `@tanstack/react-query ^5.101.4`. On npm today `@orpc/client` `latest` is `1.15.0` and `beta` is `2.0.0-beta.35` (`npm view @orpc/client dist-tags`). Nothing below depends on the exact oRPC major except where noted.

---

## 1. Executive recommendation (ranked)

**1. Outbox on the existing stack: TanStack DB query collections + `@tanstack/offline-transactions`, writes through oRPC, idempotent Drizzle inserts. Ship as an installed PWA first.** This is the smallest change that actually meets the requirements. `@tanstack/offline-transactions` is "Outbox-First": "Mutations are persisted to a durable outbox before being applied, ensuring zero data loss during offline periods", executes "in FIFO order", retries with "exponential backoff + jitter by default", elects one leader tab, passes an `idempotencyKey` to every mutation function, and lets you throw `NonRetriableError` for permanent rejections ([offline-transactions README](https://raw.githubusercontent.com/TanStack/db/main/packages/offline-transactions/README.md)). TanStack DB is the official extension of TanStack Query ("extends TanStack Query with collections, live queries and optimistic mutations, working seamlessly with REST APIs" — [TanStack DB overview](https://tanstack.com/db/latest/docs/overview)), MIT licensed ([GitHub](https://github.com/TanStack/db)), no server component, and your oRPC procedures stay the only write path so Better Auth attribution and the Drizzle audit trail are unchanged. It does not require a sync engine; the read side stays TanStack Query. Caveats: the core package is labelled BETA (`@tanstack/db` 0.8.7; `@tanstack/offline-transactions` 1.0.53 as of 2026-08-31 on npm) and the persistence layer for _synced rows_ is "the first _alpha_ release of persistence" ([TanStack blog, 0.6](https://tanstack.com/blog/tanstack-db-0.6-app-ready-with-persistence-and-includes)) — but the outbox itself uses plain IndexedDB/localStorage adapters and does not need the alpha SQLite persistence.

**2. Same design, but hand-rolled on TanStack Query alone (persisted paused mutations + `setMutationDefaults`).** Zero new dependencies, but you must accept documented gaps: only _paused_ mutations are dehydrated by default, mutation functions cannot be serialised so every offline mutation must be registered with `setMutationDefaults` ([TanStack Query mutations guide](https://tanstack.com/query/latest/docs/framework/react/guides/mutations)), ordering is per-`scope` only, there is no built-in idempotency key, and the whole-cache persister is written on a subscription rather than before the optimistic write. Fine for a pilot; you will re-implement most of option 1 to make it robust.

**3. PowerSync, if you are willing to add a sync service and a client-side SQLite.** Best true-offline engineering of the surveyed engines, Postgres-native (logical replication), server-authoritative with a checkpoint model so "the client never has to resolve conflicts locally" ([PowerSync consistency](https://docs.powersync.com/architecture/consistency)), writes still go through _your_ backend via `uploadData()` (so oRPC + Drizzle + Better Auth remain the write path), and it has an attachment queue for photos. Costs: the service is Functional Source License (FSL-1.1-ALv2) rather than OSI open source ([LICENSE](https://github.com/powersync-ja/powersync-service/blob/main/LICENSE)); self-hosting needs a separate "bucket storage" database ([self-host setup](https://docs.powersync.com/self-hosting/installation/powersync-service-setup)); client schema is SQLite-typed and separate from your Drizzle Postgres schema ([Drizzle driver](https://docs.powersync.com/client-sdks/orms/js/drizzle)); PowerSync Cloud free tier is limited and "deactivated after 1 week of inactivity" ([pricing](https://www.powersync.com/pricing)). Over-engineered for one farm's append-only forms unless you also need rich offline _reads_ across the whole herd.

**4. ElectricSQL + TanStack DB electric collections.** Electric is explicitly "a read-path sync engine for Postgres" ([README](https://github.com/electric-sql/electric)); writes go through your API and the Electric collection waits for the `txid` to come back through the sync stream ([Electric collection](https://tanstack.com/db/latest/docs/collections/electric-collection)). It is a superset of option 1 on the read side, Apache-2.0, and cheap (Electric Cloud: "Reads are free", writes $1 per 1M, usage under $5/month waived — [pricing](https://electric.ax/pricing)), but it adds a service with logical replication and a persistent filesystem ([deployment](https://electric.ax/docs/guides/deployment)) for a benefit (live shared read state) the brief does not ask for. Add later if barn tablets need live herd state.

**Not recommended for this brief:** Zero ("doesn't support offline writes or long periods offline" — [when to use](https://zero.rocicorp.dev/docs/when-to-use)); Replicache ("now in maintenance mode" — [replicache.dev](https://replicache.dev/)); Triplit (AGPL-3.0, its own database rather than Postgres, last commit 2025-09-11 and last npm publish 2025-07-31); Jazz and LiveStore (they replace Postgres as the source of truth; LiveStore says "You have an existing database which is the source of truth — consider Zero or ElectricSQL instead" — [when LiveStore](https://docs.livestore.dev/evaluation/when-livestore/)); Instant ("Instant is sunsetting. Services will continue until August 31st, 2027" — [docs](https://www.instantdb.com/docs)).

**What changes if the stack could change**

- If a native shell is acceptable: keep option 1 but package with **Capacitor**, storing the outbox and photos in `@capacitor-community/sqlite` / Filesystem instead of WebView storage, because Capacitor's own guidance is that WebView localStorage/IndexedDB "must be considered transient" ([Capacitor storage guide](https://capacitorjs.com/docs/guides/storage)). TanStack DB ships `@tanstack/capacitor-db-sqlite-persistence` (0.2.20). PowerSync also has a Capacitor SDK (beta).
- If the team would accept a React Native rewrite of the UI: **Expo** gives the most reliable background execution (`expo-background-task` on WorkManager) and first-class Better Auth support (`@better-auth/expo`), but that is a rewrite of every screen, not a packaging change.
- If offline _reads_ across large datasets became a requirement (e.g. full herd history offline): move from option 1 to PowerSync (option 3), since it is the only surveyed engine that combines Postgres, true offline writes, server authority and a local SQL engine.

---

## 2. Comparison table

| Option | Licence | Hosting | Owns writes? | Offline writes | Conflict model | Fit with oRPC + Drizzle + Better Auth | Maturity (npm, 2026-09-10) | Android PWA |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Hand-rolled TanStack Query persisted mutations | MIT | none | You (oRPC) | Yes, paused mutations persisted; must re-register `mutationFn` | None built in | Native | `@tanstack/react-query` 5.102.8 | Yes (IndexedDB via idb-keyval) |
| TanStack DB + `@tanstack/offline-transactions` | MIT | none | You (oRPC) | Yes, outbox-first, FIFO, backoff, idempotency key | Rollback on `NonRetriableError`; server authoritative | Native (query collections wrap oRPC calls) | `@tanstack/db` 0.8.7 (BETA badge), `offline-transactions` 1.0.53 | Yes (IndexedDB/localStorage adapters; SQLite/OPFS persistence alpha) |
| ElectricSQL (+ TanStack DB electric collection) | Apache-2.0 | Self-host Docker or Electric Cloud | No, read path only | Only via your own outbox (option 1 on top) | n/a (read sync); writes via API | Good: auth via proxy/gatekeeper in your API; writes unchanged | `@electric-sql/client` 1.5.28; "1.0" released 2025-03-17 | Yes (HTTP shapes) |
| PowerSync | Client SDK Apache-2.0; service FSL-1.1-ALv2 | Self-host Open Edition (needs bucket-storage DB) or Cloud (free tier, Pro from $49/mo) | No: local CRUD queue uploaded via your `uploadData()` | Yes, first-class | Server-authoritative checkpoints; you pick one of 4 strategies | Writes via your API; auth by JWT (Better Auth JWT plugin); separate SQLite-typed client schema | `@powersync/web` 2.3.0; Capacitor SDK 0.9.0 beta | Yes (wa-sqlite on IndexedDB/OPFS) |
| Zero (Rocicorp) | Apache-2.0 | Self-host zero-cache (needs `wal_level=logical`) or hosted from $30/mo | Yes via custom mutators (Drizzle adapter exists) | **No** — writes rejected when disconnected | Server mutator authoritative, transactional | Mutators can use Drizzle; cookie/token auth forwarded to your endpoints | `@rocicorp/zero` 1.9.0 | Reads yes; offline writes no |
| Replicache | Open-sourced, free | Self-host | Yes (push/pull) | Yes | Server authoritative rebase | Maintenance mode | 15.3.0 | Yes |
| Triplit | AGPL-3.0 | Self-host or (former) cloud | Own DB, not Postgres | Yes | CRDT | Poor: replaces Postgres | `@triplit/client` 1.0.50 (2025-07-31); last commit 2025-09-11 | Yes |
| Jazz | MIT (README; GitHub API reports NOASSERTION) | Jazz Cloud usage-priced or self-host | Own CoValue store, not Postgres | Yes | CRDT | Poor: replaces Postgres | `jazz-tools` 0.20.19 | Yes |
| LiveStore | Apache-2.0 | Your own sync backend (Cloudflare, Electric, S2, custom) | Own event log + SQLite | Yes | Event sourcing | Poor: "you are working on a new app" | `@livestore/livestore` 0.4.0 | Yes |
| RxDB | Apache-2.0 core; premium plugins | Any backend implementing pull/push | No: your backend | Yes | Client-side conflict handler, default prefers server | Workable but heavy; TanStack DB has an RxDB collection | `rxdb` 17.5.0 | Yes |
| WatermelonDB | MIT | Your backend (pull/pushChanges) | No: your backend | Yes | Your backend | React Native focus | active | Web via LokiJS (unverified detail) |
| Dexie Cloud | Proprietary SaaS / on-prem €3,495+ | Dexie Cloud | Own backend | Yes | Own | Poor: replaces Postgres | `dexie` 4.4.5 | Yes |
| Instant | (sunsetting) | Instant Cloud / self-host | Own DB | Yes | Own | Poor; sunset 2027-08-31 | n/a | Yes |

---

## 3. Option 1: Hand-rolled on TanStack Query + oRPC

### What the pieces do

- **`onlineManager` / `networkMode`.** Default `networkMode: 'online'` means "Queries and Mutations will not fire unless you have network connection", and while offline "TanStack Query will also pause the retry mechanism. Paused queries will then continue to run once you re-gain network connection" ([network mode guide](https://tanstack.com/query/latest/docs/framework/react/guides/network-mode)). Internally the retryer continues only when `focusManager.isFocused() && (networkMode === 'always' || onlineManager.isOnline()) && config.canRun()` ([retryer.ts, via Context7](https://github.com/TanStack/query/blob/main/packages/query-core/src/retryer.ts)). Note the _focus_ condition: a backgrounded tab does not resume paused work.
- **Persisting paused mutations.** The mutations guide's pattern: `setMutationDefaults(['addTodo'], { mutationFn, onMutate, onSuccess, onError, retry })`, `dehydrate(queryClient)` on quit, `hydrate()` + `queryClient.resumePausedMutations()` on start. The documented caveat: "When persisting to an external storage, only the state of mutations is persisted, as functions cannot be serialized", so without defaults "calling resumePausedMutations might yield an error: No mutationFn found" ([mutations guide](https://tanstack.com/query/latest/docs/framework/react/guides/mutations)). `defaultShouldDehydrateMutation` "Only dehydrates mutations that are currently paused (e.g. paused by networkMode while offline)" ([reference](https://github.com/TanStack/query/blob/main/docs/framework/angular/reference/functions/defaultShouldDehydrateMutation.md)). `resumePausedMutations()` "Does nothing (resolving immediately) if the client is currently offline" ([QueryClient reference](https://github.com/TanStack/query/blob/main/docs/framework/angular/reference/classes/QueryClient.md)).
- **`persistQueryClient` / `PersistQueryClientProvider`.** "Immediately restores any persisted cache" then "Subscribes to the query cache"; the provider "will also make sure that queries will not start fetching while we are still restoring" and its `onSuccess` "can be used to resumePausedMutations". `maxAge` "defaults to 24 hours" and older caches are "silently discarded"; `buster` invalidates on deploy. IndexedDB "is faster, stores more than 5MB, and doesn't require serialization. That means it can readily store Javascript native types, such as Date and File" ([persistQueryClient](https://tanstack.com/query/latest/docs/framework/react/plugins/persistQueryClient)). That last point matters: photo `File`s can sit inside a persisted mutation's variables when the persister is IndexedDB (idb-keyval).
- **`experimental_createQueryPersister`.** Per-query persistence only: "This will not persist the whole query client as a single item, but each query separately"; it "is explicitly labeled as experimental" and does not persist mutations ([createPersister](https://tanstack.com/query/latest/docs/framework/react/plugins/createPersister)). Not a mutation-queue tool.
- **Serial ordering.** `scope: { id }` makes mutations "run in serial queue order rather than in parallel"; later ones start `isPaused: true` and resume when earlier ones finish ([mutations guide](https://tanstack.com/query/latest/docs/framework/react/guides/mutations)). Use one scope per device to get FIFO.
- **oRPC batch plugin.** `BatchLinkPlugin` + `BatchHandlerPlugin` "combine multiple requests into a single batch"; the docs themselves say that with HTTP/2+ multiplexing the plugin is "often less useful than it once was". Streaming mode is default ("one slow request does not block the rest"); buffered mode exists "for serverless platforms or older browsers"; requests are only batched within a `group`, and `filter` can exclude e.g. file uploads. The `orpc-batch` header must be in CORS allowlists ([batch plugin](https://orpc.dev/docs/plugins/batch-requests)). In v2 the plugin "now supports all response types, including AsyncIteratorObject and File/Blob data" ([v1→v2 migration, via Context7](https://github.com/dinwwwh/orpc/blob/main/apps/content/docs/migrations/from-v1.mdx)). It is a transport optimisation; nothing in the docs says a batch is executed atomically, so do not treat it as a transaction (inference).
- **oRPC retries.** `RetryAfterLinkPlugin` retries on 429/503 honouring `Retry-After` ("Defaults to 3" attempts, 5 minute timeout), and the Client Retry plugin retries per request via context (`retry`, `retryDelay`, `shouldRetry`) ([retry-after](https://github.com/dinwwwh/orpc/blob/main/apps/content/docs/plugins/retry-after.mdx), [retry](https://github.com/dinwwwh/orpc/blob/main/apps/content/docs/plugins/retry.mdx)). These are in-process; they do not survive an app kill.
- **oRPC files.** "File and Blob are buffered in memory by default"; for large files use the Tmp File Upload plugin on Node ([file upload](https://orpc.dev/docs/file-upload-download)).
- **oRPC + TanStack Query.** `createTanstackQueryUtils` gives `mutationOptions()` and `key()` helpers and supports scoped defaults per procedure ([integration](https://github.com/dinwwwh/orpc/blob/main/apps/content/docs/integrations/tanstack-query.mdx)); `RPCLink` accepts a `headers` function and a custom `fetch` (e.g. `credentials: 'include'`) ([link](https://github.com/dinwwwh/orpc/blob/main/apps/content/docs/rpc/link.mdx)).

### What it covers

Queueing while offline, resuming on reconnect, surviving reload _if_ the persister flushed and the mutation had a registered default, simple FIFO via `scope`, storing photo Blobs alongside the mutation in IndexedDB.

### What it does not cover (you build it)

- **Idempotency.** Nothing generates or sends an idempotency key; retries after a partial success (request reached the server, response lost) will double-insert unless the procedure is idempotent by construction (see §6).
- **Durability at write time.** The persister writes on cache subscription, not before the optimistic write; a kill between the two loses the entry. TanStack DB's outbox persists _before_ applying, which is why it ranks higher.
- **Ordering across scopes and across tabs.** `scope` is per-key and per-tab; two tabs/PWA windows each run their own queue.
- **Conflicts.** None; whatever the server says on replay is the outcome. `retry` on a mutation is attempt-count based and does not distinguish 401/409/422 from network failure — you must write `retry: (count, error) => ...` yourself.
- **Retries after app kill.** Only if something re-opens the app: TanStack Query has no service-worker integration, so Background Sync (§5) has to be layered on separately, and the sync event handler runs in the service worker without your QueryClient.
- **Session expiry.** Better Auth sessions "expire after 7 days by default" with `updateAge` of one day ([session management](https://www.better-auth.com/docs/concepts/session-management)); a device offline longer than that will replay into 401s. Treat 401 as "pause the queue and ask for login", never as a permanent failure.

---

## 4. Option 2: Sync engines

### 4.1 TanStack DB (with query collections; Electric/PowerSync collections optional)

- **What it is.** "The reactive client store for your API"; "extends TanStack Query with collections, live queries and optimistic mutations". Collections take `onInsert`/`onUpdate`/`onDelete` handlers "responsible for writing the mutation to the backend"; "If the handler throws an error, the optimistic state is rolled back". Built-in collection types: QueryCollection (fetch), ElectricCollection, TrailBaseCollection, RxDBCollection, PowerSyncCollection (sync), LocalStorageCollection, LocalOnlyCollection ([overview](https://tanstack.com/db/latest/docs/overview)). Manual `createTransaction({ autoCommit: false, mutationFn })` groups several mutations and commits on a user action, e.g. "Save" at the end of an SOP ([mutations guide, via Context7](https://github.com/tanstack/db/blob/main/docs/guides/mutations.md)).
- **Offline transactions (`@tanstack/offline-transactions`).** `startOfflineExecutor({ collections, mutationFns, storage, maxConcurrency, jitter, beforeRetry, onUnknownMutationFn, leaderElection, onlineDetector })`; adapters `IndexedDBAdapter`, `LocalStorageAdapter`; `createOfflineTransaction({ mutationFnName })` then `tx.mutate(() => collection.insert(...))`; `waitForInit()` performs "storage probe, leader election, outbox replay"; each `mutationFn` receives `{ transaction, idempotencyKey }`; `NonRetriableError` "stop[s] retries and remove[s] transactions from the outbox for permanent failures like validation errors or conflicts" ([SKILL.md, via Context7](https://github.com/tanstack/db/blob/main/packages/offline-transactions/skills/offline/SKILL.md)). README guarantees: outbox-first, "Transactions are processed one at a time in the order they were created", "exponential backoff + jitter by default", "Only one tab acts as the 'leader'", non-leader tabs "operate in online-only mode for safety" ([README](https://raw.githubusercontent.com/TanStack/db/main/packages/offline-transactions/README.md)). Mutation functions are looked up by _name_ from the outbox, which solves TanStack Query's "functions cannot be serialized" problem by design.
- **Persistence of synced rows (0.6+, alpha).** "durable local state, including synced data and pending mutations"; SQLite is "its unified persistence layer" across "browser (via SQLite WASM), React Native and Expo, Node, Electron, Tauri, Capacitor, Cloudflare Durable Objects"; "The server remains authoritative"; explicitly "the first _alpha_ release of persistence" ([blog](https://tanstack.com/blog/tanstack-db-0.6-app-ready-with-persistence-and-includes)). Browser adapter is "wa-sqlite + OPFS" and multi-tab "uses the Web Locks API to elect a leader tab, and BroadcastChannel to fan out committed transactions" ([browser adapter README](https://raw.githubusercontent.com/TanStack/db/main/packages/browser-db-sqlite-persistence/README.md)); Expo and Capacitor adapters exist ([expo README](https://github.com/tanstack/db/blob/main/packages/expo-db-sqlite-persistence/README.md), [capacitor README](https://github.com/tanstack/db/blob/main/packages/capacitor-db-sqlite-persistence/README.md)). For OpenFarm the reference data (animals, SOP definitions) can simply stay in TanStack Query's persisted cache; you only need the alpha persistence if you want the full collection durable.
- **Licence, cost, hosting.** MIT; no server ([GitHub](https://github.com/TanStack/db)). Status badge "BETA". npm 2026-08-31: `@tanstack/db` 0.8.7, `@tanstack/react-db` 0.3.7, `@tanstack/query-db-collection` 1.2.12, `@tanstack/offline-transactions` 1.0.53, persistence adapters 0.2.20.
- **Fit.** Best of the survey: oRPC procedures are called from `mutationFns`; Better Auth cookies ride along with `RPCLink`'s `fetch`; Drizzle stays the only writer.
- **Conflict model.** Optimistic overlay, rolled back on handler error; server authoritative. No merge logic; for append-only records none is needed.
- **Android PWA.** Yes; IndexedDB outbox. Alpha OPFS persistence is optional.

### 4.2 ElectricSQL

- **What it is.** "a read-path sync engine for Postgres. It syncs data out of Postgres into local clients over HTTP using a primitive called a Shape" ([intro](https://electric.ax/docs/intro)); "Electric is a read-path sync engine" ([README](https://github.com/electric-sql/electric)). Writes are patterns on top: online writes, optimistic state, shared persistent optimistic state, through-the-database sync (PGlite). The guide's own trade-off list notes optimistic state is "data loss on page reload" unless shared/persistent, and that through-the-DB sync is a "heavy dependency" with "rollback handling difficulty"; on conflicts: "conflicts are extremely rare and can be mitigated well by strategies like presence" ([writes guide](https://electric.ax/docs/guides/writes)).
- **With TanStack DB.** Handlers "persist mutations to the backend and wait for Electric to sync the changes back"; the API returns a Postgres `txid` and the client `awaitTxId()`s it; "TanStack DB blocks sync data until the mutation is confirmed" ([electric collection](https://tanstack.com/db/latest/docs/collections/electric-collection)).
- **Licence, cost, hosting.** Apache-2.0 ([LICENSE](https://raw.githubusercontent.com/electric-sql/electric/main/LICENSE)); "1.0" released 2025-03-17 ([README](https://github.com/electric-sql/electric)). Self-host: "Postgres, version 14 and above", logical replication, a role with `REPLICATION`, Docker image `electricsql/electric`, "A persistent filesystem" (`ELECTRIC_STORAGE_DIR`), direct DB connection (no pooler), ideally behind a caching proxy/CDN ([deployment](https://electric.ax/docs/guides/deployment)). Electric Cloud: PAYG "Writes: $1 per 1M writes", "Retention: $0.10 per GB·month", usage under $5/month waived; Pro $249/month; Scale $1,999/month ([pricing](https://electric.ax/pricing)).
- **Auth.** Proxy pattern ("authorize Shape requests using a reverse-proxy" that sets table/WHERE server-side) or gatekeeper tokens; works with any JWT/session you can decode; add `Vary` on auth headers ([auth guide](https://electric.ax/docs/guides/auth)). A Nitro route in the existing app can be the proxy, checking the Better Auth session.
- **Write path.** Does not own writes.
- **Android PWA.** Yes (plain HTTP long-polling shapes).
- **Verdict.** Excellent read-sync layer, orthogonal to the capture problem. Adopt only when live shared reads matter.

### 4.3 PowerSync

- **What it is.** "keeps in-app SQLite synced with your backend"; backends: PostgreSQL, MongoDB, MySQL (Beta), SQL Server (Beta); SDKs: JS Web, React Native & Expo, Node, Capacitor (beta), Tauri (alpha), Flutter, Kotlin, Swift, .NET, Rust ([overview](https://docs.powersync.com/intro/powersync-overview)).
- **Write path.** Local CRUD queue (PUT/PATCH/DELETE) drained by your `uploadData()` in a `PowerSyncBackendConnector`; your endpoint must apply writes synchronously ("don't place writes into something like a queue for processing later"); return 5xx only for temporary failures and 2xx for validation errors because a 4xx "will block the PowerSync client's upload queue" ([writing client changes](https://docs.powersync.com/installation/app-backend-setup/writing-client-changes)). This maps cleanly to an oRPC procedure using Drizzle.
- **Conflict model.** Causal+ consistency via checkpoints; the client "does not advance to a new checkpoint" until its uploads are acknowledged, so "the client never has to resolve conflicts locally"; if the next checkpoint does not reflect a write "those changes will be removed from the client"; four recommended strategies (relaxed constraints, strict ordering with blocking, flexible ordering with a server-side dead-letter queue, lossy) ([consistency](https://docs.powersync.com/architecture/consistency)).
- **Postgres requirements.** "Postgres version 11 or greater", `wal_level = logical`, a `powersync` publication and replication role; "some 'serverless Postgres' providers do not support logical replication" ([database setup](https://docs.powersync.com/installation/database-setup)).
- **Auth.** JWT with `kid`, `aud` = instance URL or configured audience, `sub` = user id, "must expire in 24 hours or less, and 60 minutes or less is recommended"; RS256/EdDSA/ES256 via JWKS; HS256 for dev only ([custom auth](https://docs.powersync.com/installation/authentication-setup/custom)). Better Auth's JWT plugin provides `/jwks` and `/token`, default EdDSA with 15-minute expiry ([Better Auth JWT plugin](https://www.better-auth.com/docs/plugins/jwt)) — a good match.
- **Drizzle.** `@powersync/drizzle-driver` (0.8.0) runs Drizzle against the _local_ SQLite; "the PowerSync schema only supports SQLite types (text, integer, and real)" and "most Drizzle constraint features ... are currently not supported", so you maintain a second schema ([Drizzle driver](https://docs.powersync.com/client-sdks/orms/js/drizzle)).
- **Web storage.** wa-sqlite with `IDBBatchAtomicVFS` (default, IndexedDB) or OPFS VFS variants; "Full multi-tab support relies on shared web workers, which are disabled by default on Android, iOS, and Safari. On these platforms, the SDK falls back to a less reliable broadcast-based mechanism" ([web SDK](https://docs.powersync.com/client-sdk-references/javascript-web)).
- **Photos.** Attachment helper: "sync small metadata records through PowerSync while storing actual files in purpose-built storage systems"; file "saved locally and a record is created in the attachments table with state QUEUED_UPLOAD", uploaded in the background with retry ([attachments](https://docs.powersync.com/usage/use-case-examples/attachments-files)).
- **Capacitor SDK.** Beta; the SQLite-driver portion "considered production-ready for tested use cases"; Android API 24+; no native encryption yet; no multi-tab on native ([Capacitor SDK](https://docs.powersync.com/client-sdk-references/capacitor)).
- **Licence, cost, hosting.** Service: "Functional Source License, Version 1.1, ALv2 Future License" — non-compete restriction, converts to Apache-2.0 on "the second anniversary" of each release ([LICENSE](https://github.com/powersync-ja/powersync-service/blob/main/LICENSE)); JS SDK repo is Apache-2.0 (GitHub API). Cloud Free: "Up to 2 GB data synced / month", "50 peak concurrent clients", "Free projects are deactivated after 1 week of inactivity"; Pro "From $49/month"; Team "From $599/month"; Open Edition free self-host, Enterprise Self-Hosted custom ([pricing](https://www.powersync.com/pricing)). Self-host needs the Docker image `journeyapps/powersync-service` plus a separate bucket-storage database (MongoDB replica set, or Postgres 14+ which may share the source server) and a `service.yaml` with replication/storage/client_auth/sync sections; "For production environments, we recommend using JWKS with asymmetric keys" ([getting started](https://docs.powersync.com/self-hosting/getting-started), [service setup](https://docs.powersync.com/self-hosting/installation/powersync-service-setup)).
- **Verdict.** The strongest engine for the _problem class_, but it brings a service, a second schema, a second database for the service, and a source-available licence, to a one-farm app that mostly appends forms.

### 4.4 Zero (Rocicorp) and Replicache

- **Zero.** "syncing the data your UI needs into a local, normalized client datastore"; reads and writes hit the local store first ([intro](https://zero.rocicorp.dev/docs/introduction)). Mutators run on client then on your push endpoint "in a transaction against your database"; adapters "for Drizzle, Kysely, Prisma, node-postgres, and postgres.js"; "if the mutator throws, the entire mutation is rolled back"; clients "await .server for the server result" ([mutators](https://zero.rocicorp.dev/docs/mutators)). Auth: cookies forwarded via `ZERO_QUERY_FORWARD_COOKIES`/`ZERO_MUTATE_FORWARD_COOKIES`, or bearer tokens; permissions are code in your query/mutator endpoints ([auth](https://zero.rocicorp.dev/docs/auth)). **Offline: "writes are rejected" when disconnected; "Zero explicitly states it does not currently support offline writes"; "the cost to support offline is extremely high"** ([offline](https://zero.rocicorp.dev/docs/offline)); "Zero is not local-first" and "doesn't support offline writes or long periods offline" ([when to use](https://zero.rocicorp.dev/docs/when-to-use)). Apache-2.0 ([open source](https://zero.rocicorp.dev/docs/open-source)); self-host needs `wal_level=logical`, direct (non-pgbouncer) connection, replication-manager + view-syncers with a SQLite replica on fast disk ([self-host](https://zero.rocicorp.dev/docs/self-host)); hosted Hobby "$30/mo", Professional "$300/mo", BYOC "$1000/mo + AWS" ([zero.rocicorp.dev](https://zero.rocicorp.dev/)). `@rocicorp/zero` 1.9.0. Disqualified by the offline-writes requirement alone.
- **Replicache.** "Replicache is now in maintenance mode. We have open-sourced the code and no longer charge for its use." and "We have shifted focus to Zero" ([replicache.dev](https://replicache.dev/)). Do not start new work on it.

### 4.5 Triplit

"An open-source database that syncs data between server and browser in real-time"; own storage (SQLite/IndexedDB/LevelDB/Memory), CRDT-based, "Offline-mode with automatic reconnection" ([README](https://github.com/aspen-cloud/triplit/blob/main/README.md)). Licence: GNU AGPL v3 ([LICENSE](https://raw.githubusercontent.com/aspen-cloud/triplit/main/LICENSE); GitHub API `AGPL-3.0`). Activity: last commit 2025-09-11 ("fixup query update for triplit route"), repo `pushed_at` 2026-01-19, last npm publish of `@triplit/client` 1.0.50 on 2025-07-31. It is its own database, not a Postgres sync layer, so Drizzle/Postgres would no longer be the source of truth. The triplit.dev site did not render for me (see open questions). Not a fit.

### 4.6 Jazz

"A local-first relational database with row-level permissions, real-time sync, and offline support"; React, Vue, Svelte, Solid, Expo/React Native, TS, Rust ([docs](https://jazz.tools/docs)). "runs across your frontend, backend and our global storage cloud"; README says MIT (GitHub API reports `NOASSERTION`) ([GitHub](https://github.com/garden-co/jazz)). Pricing: usage-based compute "$0.039 per hour of 2GB RAM instance", storage "$0.45 per GB/month", egress "$0.09 per GB out", with included allowances; "The single-tenant Jazz database server will always be open-source and is very easy to self-host" ([jazz.tools](https://jazz.tools/)). `jazz-tools` 0.20.19. It replaces Postgres as the data store; your audit trail would live in Jazz, not Drizzle. Not a fit for this stack.

### 4.7 LiveStore

"state management framework based on reactive SQLite and built-in sync engine", event-sourced, adapters for web, Expo, Node, Cloudflare Durable Objects, Electron, Tauri; sync providers Cloudflare Workers, ElectricSQL, S2 or custom; docs "still work in progress", version 0.4.0 ([docs](https://docs.livestore.dev/)). Apache-2.0 ([GitHub](https://github.com/livestorejs/livestore)). Its own fit guide: good if "you are working on a new app"; not if "You have an existing database which is the source of truth — consider Zero or ElectricSQL instead"; data "should fit into a in-memory SQLite database ... up to 1GB"; adds "a few hundred kB" to the bundle ([when LiveStore](https://docs.livestore.dev/evaluation/when-livestore/)). Interesting that its event-sourced model is _exactly_ an audit log, but it would own the data. Not a fit unless the data layer is rebuilt around it.

### 4.8 Others

- **RxDB.** Replication protocol = `pullHandler` (from checkpoint), `pushHandler` (with conflict detection), `pullStream$`; "RxDB resolves all conflicts on the client" via a conflict handler that by default prefers server state; backends need soft deletes (`_deleted: true`) and sortable `updatedAt` checkpoints; core Apache-2.0, some plugins premium ([replication](https://rxdb.info/replication.html)). `rxdb` 17.5.0; TanStack DB has an `RxDBCollection`. Viable, but you would be writing pull/push endpoints in oRPC and adopting RxDB's document model; for append-only forms it adds more than it removes.
- **WatermelonDB.** MIT, React/React Native, "Sync with your own backend" via pull/pushChanges ([README](https://github.com/Nozbe/WatermelonDB)). Primarily a React Native store; not a fit for a TanStack Start DOM app.
- **Dexie Cloud.** Free tier "3 production users" / "100 MB storage"; Pro "€0.12 per user / month"; on-prem Business "€3,495 forever", Enterprise "€7,995 forever" ([pricing](https://dexie.org/cloud/pricing)). Own backend, not Postgres.
- **Instant.** "Instant is sunsetting. Services will continue until August 31st, 2027" ([docs](https://www.instantdb.com/docs)). Exclude.
- **Workbox (`workbox-background-sync`)** is not a sync engine but is the standard service-worker queue; covered in §5.

---

## 5. Packaging: PWA vs Capacitor vs Expo

### 5.1 PWA on Android Chrome

- **Background Sync API.** "enables a web app to defer tasks so that they can be run in a service worker once the user has a stable network connection"; "Limited availability", WICG spec, HTTPS only ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API)). Support: Chrome for Android "152: Supported", Samsung Internet supported, Android WebView "152: Supported"; Firefox and Safari not supported ([caniuse](https://caniuse.com/background-sync)). Semantics: "You can only register for a sync event when the user has a window open to the site"; on failure "another sync is scheduled to retry. Retry syncs also wait for connectivity and employ an exponential back-off"; "The event execution time is capped" ([Chrome blog](https://developer.chrome.com/blog/background-sync)). The spec's `lastChance` is "true if no further attempts will be made after the current attempt" and "A user agent will retry a sync event based on some user agent defined heuristics" ([WICG spec](https://wicg.github.io/background-sync/spec/)). Chrome's concrete attempt/backoff constants live in Chromium source; I could not fetch that file (see open questions), so treat Background Sync as _best-effort acceleration_, not the durability guarantee.
- **Workbox queue.** `workbox-background-sync` stores failed requests in IndexedDB; `maxRetentionTime` (example `24 * 60` minutes; no default documented); "failed requests must be the result of a network failure. Requests that result in a 400 or 500-level error status will not be retried"; without native support it will "attempt a replay whenever your service worker starts up" ([Workbox guide](https://developer.chrome.com/docs/workbox/retrying-requests-when-back-online), [module docs](https://developer.chrome.com/docs/workbox/modules/workbox-background-sync)). `workbox-background-sync` 7.4.1, repo active. A 2018 issue reported that on Chrome for Android "background sync wont fire until I go into chrome://serviceworker-internals and restart the worker"; it is closed without a stated resolution in the page I fetched ([workbox#1789](https://github.com/GoogleChrome/workbox/issues/1789)) — plan on the SW-startup replay as the real path.
- **Design consequence.** Two viable shapes: (a) keep the outbox in the page (TanStack DB executor) and use the SW `sync` event only as a wake-up that opens/pings a client, or (b) route oRPC POSTs through the SW so Workbox's queue replays the raw HTTP requests. (b) only works because every replayed request carries an idempotency key (§6); otherwise SW replay after a lost response double-inserts. (a) is simpler to reason about with TanStack DB; (b) survives the page being closed. Doing both is defensible: the executor is the source of truth; the SW queue is a belt-and-braces replay of the same idempotent requests.
- **Periodic Background Sync** (for pulling reference data) needs an installed PWA: "A web app can only use periodic background sync after a person has installed it on their device, and has launched it as a distinct application" ([Chrome docs](https://developer.chrome.com/docs/capabilities/periodic-background-sync)); MDN: "In Chrome, the permission is granted only to an installed web app" ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Periodic_Background_Synchronization_API)).
- **Storage limits and eviction.** Chromium: "an origin can store up to 60% of the total disk size"; eviction is LRU by origin under storage pressure and skips persistent origins ([MDN quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)); "Chrome allows the browser to use up to 80% of total disk space. An origin can use up to 60%"; incognito "approximately 5%" ([web.dev storage](https://web.dev/articles/storage-for-the-web)). `navigator.storage.persist()` is auto-granted by Chrome based on "How high is the level of site engagement? Has the site been installed or bookmarked? Has the site been granted permission to show notifications?"; "data is very rarely cleared automatically by Chrome. It is far more common for users to manually clear storage" ([web.dev persistent storage](https://web.dev/articles/persistent-storage)). So: install the PWA to the home screen, request persistence, and defend against the human "Clear site data" by syncing eagerly and showing the pending count on screen.
- **Camera.** `<input type="file" accept="image/*" capture="environment">` opens the rear camera on mobile ("The outward-facing camera and/or microphone should be used") ([MDN capture](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture)); IndexedDB can store the resulting `File` directly (TanStack Query persistQueryClient doc, above). Downscale on-device before queueing to keep the outbox small.
- **Auth.** Same-origin cookies from Better Auth just work; no change.
- **Verdict.** Sufficient for the brief _if_ the staff phones are Chrome/Samsung Internet on Android and the app is installed. Photos and the outbox live in IndexedDB; sync happens when the app is open or the SW is woken. This is where to start.

### 5.2 Capacitor (same web code in a native shell)

- **Storage.** Capacitor warns "the OS will reclaim local storage from Web Views if a device is running low on space"; Web storage APIs "must be considered transient"; recommends Preferences for small data and SQLite ("the most widely supported option") for large data ([storage guide](https://capacitorjs.com/docs/guides/storage)). `@capacitor-community/sqlite` 8.1.1; TanStack DB `@tanstack/capacitor-db-sqlite-persistence` 0.2.20 targets exactly that driver; PowerSync's Capacitor SDK uses it too. Photos go to the Filesystem `Data` directory ("On Android it's the directory holding application files. Files will be deleted when the application is uninstalled"), not `Cache` ("Can be deleted in cases of low memory") ([Filesystem](https://capacitorjs.com/docs/apis/filesystem)).
- **Camera.** `@capacitor/camera` 8.2.4: result types `Uri`, `Base64`, `DataUrl`; on web it uses PWA Elements' camera modal or "falls back to an <input type="file"> picker" ([Camera](https://capacitorjs.com/docs/apis/camera)).
- **Background execution.** Background Runner is "an event-based standalone JavaScript environment for executing your Javascript code outside of the web view" with only `fetch`, timers, `crypto`, `TextEncoder`; "the typical Web APIs you may be used to may not be available. This includes DOM APIs"; Android "you should limit your work to 30 seconds at most"; "Repeating background tasks have a minimal interval of at least 15 minutes" ([Background Runner](https://capacitorjs.com/docs/apis/background-runner)). It cannot reach the WebView's IndexedDB (no such API listed), so a background flush would need the outbox in SQLite/Filesystem that the runner can read — Background Runner exposes no SQLite API either, which makes a true background drain impractical (inference from the API list). Practically, Capacitor sync is foreground sync plus a periodic runner that can at most `fetch` small JSON.
- **Auth.** Better Auth documents an Expo plugin but "contains no references to Capacitor or WebView compatibility" ([Expo integration](https://www.better-auth.com/docs/integrations/expo)). The Bearer plugin is "an alternative to browser cookies ... intended only for APIs that don't support cookies" with the warning "Improper implementation could easily lead to security vulnerabilities" ([Bearer plugin](https://www.better-auth.com/docs/plugins/bearer)) — needed if the WebView origin is not your API origin.
- **Verdict.** Worth it when (a) storage eviction on the PWA is observed in practice, (b) you want the camera/gallery UX and app-store distribution, or (c) you move to PowerSync. It does not buy true background sync.

### 5.3 Expo / React Native

- `expo-background-task` runs "outside your app's lifecycle" on WorkManager with "minimum 15 minutes" interval and non-deterministic scheduling ([background-task](https://docs.expo.dev/versions/latest/sdk/background-task/)); `expo-background-fetch` "is being replaced" and "will be removed in an upcoming release" ([background-fetch](https://docs.expo.dev/versions/latest/sdk/background-fetch/)).
- `expo-sqlite`: "The database is persisted across restarts of your app", web "alpha", Drizzle supported via the expo-sqlite integration ([sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/)); `expo-camera` on Android/iOS/web with `takePictureAsync` returning `uri`/`base64` ([camera](https://docs.expo.dev/versions/latest/sdk/camera/)). TanStack DB has `@tanstack/expo-db-sqlite-persistence`; PowerSync has a React Native SDK; Better Auth has `@better-auth/expo` with `expo-secure-store` cookie storage ([Expo integration](https://www.better-auth.com/docs/integrations/expo)).
- **Verdict.** The most robust native story, but it is a rewrite of the UI (React Native, not React DOM), so it is a product decision rather than a packaging tweak. Only choose it if a native app was going to happen anyway.

---

## 6. Patterns for idempotent, ordered, attributed writes

These apply to every option above; with option 1 they _are_ the design.

1. **Client-generated record IDs, UUIDv7.** RFC 9562: "Implementations SHOULD utilize UUIDv7 instead of UUIDv1 and UUIDv6 if possible" (§5.7); v7 is time-ordered with better index locality (§6.11); §6.2 gives three methods for monotonicity within a millisecond ([RFC 9562](https://www.rfc-editor.org/rfc/rfc9562.html)). PostgreSQL 18.0 (released 2025-09-25) adds `uuidv7()` ("temporally sortable") and `uuidv4()` ([release notes](https://www.postgresql.org/docs/release/18.0/)); `uuid_extract_timestamp()` works for v1 and v7 ([functions-uuid](https://www.postgresql.org/docs/18/functions-uuid.html)). Generate the id on the device at capture time so the primary key _is_ the dedupe key: `INSERT ... ON CONFLICT (id) DO NOTHING RETURNING ...`, and return the existing row when nothing was inserted. Retries after a lost response then become no-ops.
2. **Idempotency key per transaction, not just per row.** For multi-row submissions (an SOP run with several steps) use a transaction-level key. Semantics from the IETF draft: key "MUST be unique and MUST NOT be reused with another request with a different request payload", UUID recommended (§2.2); optional fingerprint of the payload (§2.4); duplicate → "respond with the result of the previously completed operation, success or an error" (§2.6); reuse with different payload → 422 (§2.7); retried before the original completed → 409 (§2.6–2.7); missing key on an operation that requires it → 400 (§2.7) ([draft-ietf-httpapi-idempotency-key-header-07](https://www.ietf.org/archive/id/draft-ietf-httpapi-idempotency-key-header-07.txt); note the draft is marked expired). Stripe's production semantics: results saved "regardless of whether it succeeds or fails", keys "up to 255 characters", "V4 UUIDs" suggested, keys pruned "after they're at least 24 hours old", and parameters are compared so reuse with different parameters errors ([Stripe](https://docs.stripe.com/api/idempotent_requests)). Implementation: a Drizzle table `idempotency_keys(key PK, user_id, fingerprint, status, response jsonb, created_at)` inserted in the same transaction as the records; the oRPC procedure takes `idempotencyKey` in its input (TanStack DB supplies one per transaction) and replays the stored response. Devices can be offline for days, so keep keys at least as long as the longest plausible outage (weeks), not 24 h.
3. **Per-device sequence numbers.** Each device holds a `deviceId` (UUID generated on first launch, stored with the outbox) and a monotonically increasing `seq`. Every entry carries `(deviceId, seq)`. The client FIFO outbox guarantees send order; the server stores both, indexes `(device_id, seq)` uniquely, and can detect gaps (a lost entry) for the audit trail. Do not _reject_ out-of-order arrivals for append-only records — record and flag them; PowerSync's guidance describes the same choice between "Strict ordering preservation: Block the queue on errors" and "Flexible ordering: Persist failed transactions in a separate backend queue while acknowledging changes" ([consistency](https://docs.powersync.com/architecture/consistency)).
4. **Two clocks, both stored.** `recorded_at` = device wall clock at capture (plus offset/timezone) — the claimed observation time; `received_at` = server `now()` at insert — the authoritative audit time. Use `received_at` for the audit ordering and `recorded_at` for farm semantics (which milking, which day's weight). Flag rows where `received_at - recorded_at` exceeds a threshold or where `recorded_at` is in the server's future (clock skew). Never let the client set `received_at`.
5. **Attribution from the session, never from the payload.** The actor is the Better Auth session user at _sync_ time. If the phone is shared and the logged-in user changed between capture and sync, the record's `recorded_by` (captured client-side from the session at capture time) will differ from the syncing user; store both and require `recorded_by == session.user` unless the syncing user has a "submit on behalf" role. Sessions "expire after 7 days by default" ([Better Auth sessions](https://www.better-auth.com/docs/concepts/session-management)); on 401 the queue must pause and prompt login rather than dropping entries (in TanStack DB terms: a plain `Error`, never `NonRetriableError`).
6. **Entries against an animal whose state changed server-side.** Treat the entry as an _event that happened_ at `recorded_at`, not as a command against current state. Policy: (a) unknown animal id, unauthorised user, malformed payload → permanent reject (`NonRetriableError`, 422), surfaced to the user with the original data preserved locally for re-entry; (b) animal since sold/died/moved pens, treatment already recorded by someone else, weight outside range → _accept_ the row with a `review_status = 'needs_review'` and a reason, because discarding a barn observation destroys audit evidence. This mirrors Electric's observation that "conflicts are extremely rare" for this kind of app ([writes](https://electric.ax/docs/guides/writes)) and PowerSync's "Relaxed constraints: Accept somewhat inconsistent data rather than discarding it entirely". For the few true _updates_ (correcting a yield) send `expected_version`; on mismatch store the attempted change as a conflict record for a human, do not overwrite.
7. **Batching.** Prefer an explicit oRPC procedure that accepts an array of entries plus one idempotency key and applies them in one Drizzle transaction, over relying on the oRPC batch plugin, whose docs describe transport grouping and streaming responses but no atomicity ([batch plugin](https://orpc.dev/docs/plugins/batch-requests)). Keep photos out of the JSON batch: queue them as separate idempotent uploads keyed by the record id + slot, since "File and Blob are buffered in memory by default" ([oRPC files](https://orpc.dev/docs/file-upload-download)).
8. **Audit table shape.** Append-only `audit_events(id uuidv7, entity, entity_id, action, actor_id, device_id, device_seq, idempotency_key, recorded_at, received_at, payload jsonb)` written in the same transaction as the domain row. With client UUIDs and idempotency keys, every replay either lands exactly once or is provably a duplicate.

---

## 7. Unverified / open questions

- **Chromium Background Sync retry constants** (max attempts, initial delay, backoff factor). `chromium.googlesource.com` returned `NOT_FOUND` for `content/browser/background_sync/background_sync_parameters.cc` and the GitHub mirror 404'd. The spec only says retries follow "user agent defined heuristics". Verify before relying on SW replay for anything time-sensitive.
- **Workbox issue #1789** (Android Chrome sync not firing until SW restart) is closed but the fetched page showed no resolution. Test on the actual staff phones.
- **TanStack DB docs pages** `docs/guides/persistence` and `docs/guides/offline-transactions` returned 404 on tanstack.com; I used the package READMEs and the 0.6 blog post instead. The core repo says BETA; persistence is "alpha"; `@tanstack/offline-transactions` is at 1.0.53 with no alpha label in its README. Whether the offline executor's optimistic state is rolled back on `NonRetriableError` is not stated in the README (the SKILL.md says the transaction is removed from the outbox).
- **Jazz licence**: README says MIT; GitHub API reports `NOASSERTION`; `jazz.tools/pricing`, `/cloud` and the sync-and-storage docs URLs all 404'd. Pricing figures come from the homepage.
- **Triplit**: the marketing site returned no content to the fetcher, so any sunset/maintenance notice is unconfirmed; the inactivity signal is from GitHub (last commit 2025-09-11) and npm (last publish 2025-07-31).
- **Zero's mutation idempotency/rebase details** were not on the mutators page I fetched; irrelevant given it rejects offline writes.
- **Better Auth + Capacitor**: no official documentation found; only Expo is documented. If Capacitor is chosen, confirm cookie handling for the WebView origin or use the Bearer plugin.
- **PowerSync Open Edition production suitability**: the self-hosting page makes no explicit statement either way, and the Dashboard "is currently not available when self-hosting".
- **WatermelonDB web backend (LokiJS)** was not confirmed from the README excerpt.
- **Stack versions**: the brief's oRPC 2.0.0-beta.35 / Drizzle 1.0.0-rc.4 / Better Auth 1.7.3 do not match the worktree (oRPC ^1.14.12, Drizzle ^0.45.2, Better Auth 1.7.1). The oRPC v2 batch/File statements above come from the v1→v2 migration notes; the rest is version-independent.
- **Idempotency-Key draft status**: draft-07 (2025-10-15) is listed as "Expired & archived" on the IETF datatracker; it remains the best-documented semantics but is not a standard.

---

## 8. Sources

TanStack Query

- https://tanstack.com/query/latest/docs/framework/react/guides/mutations
- https://tanstack.com/query/latest/docs/framework/react/plugins/persistQueryClient
- https://tanstack.com/query/latest/docs/framework/react/plugins/createPersister
- https://tanstack.com/query/latest/docs/framework/react/guides/network-mode
- https://github.com/TanStack/query/blob/main/docs/framework/angular/reference/functions/defaultShouldDehydrateMutation.md
- https://github.com/TanStack/query/blob/main/docs/framework/angular/reference/classes/QueryClient.md
- https://github.com/TanStack/query/blob/main/packages/query-core/src/retryer.ts

TanStack DB

- https://tanstack.com/db/latest/docs/overview
- https://tanstack.com/db/latest/docs/collections/electric-collection
- https://tanstack.com/blog/tanstack-db-0.6-app-ready-with-persistence-and-includes
- https://github.com/TanStack/db
- https://raw.githubusercontent.com/TanStack/db/main/packages/offline-transactions/README.md
- https://github.com/tanstack/db/blob/main/packages/offline-transactions/skills/offline/SKILL.md
- https://github.com/tanstack/db/blob/main/docs/guides/mutations.md
- https://raw.githubusercontent.com/TanStack/db/main/packages/browser-db-sqlite-persistence/README.md
- https://github.com/tanstack/db/blob/main/packages/expo-db-sqlite-persistence/README.md
- https://github.com/tanstack/db/blob/main/packages/capacitor-db-sqlite-persistence/README.md

oRPC

- https://orpc.dev/docs/plugins/batch-requests
- https://orpc.dev/docs/file-upload-download
- https://github.com/dinwwwh/orpc/blob/main/apps/content/docs/plugins/retry-after.mdx
- https://github.com/dinwwwh/orpc/blob/main/apps/content/docs/plugins/retry.mdx
- https://github.com/dinwwwh/orpc/blob/main/apps/content/docs/migrations/from-v1.mdx
- https://github.com/dinwwwh/orpc/blob/main/apps/content/docs/integrations/tanstack-query.mdx
- https://github.com/dinwwwh/orpc/blob/main/apps/content/docs/rpc/link.mdx

ElectricSQL

- https://electric.ax/docs/intro
- https://electric.ax/docs/guides/writes
- https://electric.ax/docs/guides/auth
- https://electric.ax/docs/guides/deployment
- https://electric.ax/pricing
- https://github.com/electric-sql/electric
- https://raw.githubusercontent.com/electric-sql/electric/main/LICENSE

PowerSync

- https://docs.powersync.com/intro/powersync-overview
- https://docs.powersync.com/installation/app-backend-setup/writing-client-changes
- https://docs.powersync.com/architecture/consistency
- https://docs.powersync.com/installation/database-setup
- https://docs.powersync.com/installation/authentication-setup/custom
- https://docs.powersync.com/client-sdk-references/javascript-web
- https://docs.powersync.com/client-sdk-references/capacitor
- https://docs.powersync.com/client-sdks/orms/js/drizzle
- https://docs.powersync.com/usage/use-case-examples/attachments-files
- https://docs.powersync.com/self-hosting/getting-started
- https://docs.powersync.com/self-hosting/installation/powersync-service-setup
- https://www.powersync.com/pricing
- https://github.com/powersync-ja/powersync-service/blob/main/LICENSE

Zero / Replicache

- https://zero.rocicorp.dev/
- https://zero.rocicorp.dev/docs/introduction
- https://zero.rocicorp.dev/docs/offline
- https://zero.rocicorp.dev/docs/when-to-use
- https://zero.rocicorp.dev/docs/mutators
- https://zero.rocicorp.dev/docs/auth
- https://zero.rocicorp.dev/docs/open-source
- https://zero.rocicorp.dev/docs/self-host
- https://replicache.dev/

Triplit, Jazz, LiveStore, others

- https://github.com/aspen-cloud/triplit/blob/main/README.md
- https://raw.githubusercontent.com/aspen-cloud/triplit/main/LICENSE
- https://jazz.tools/docs
- https://jazz.tools/
- https://github.com/garden-co/jazz
- https://docs.livestore.dev/
- https://docs.livestore.dev/evaluation/when-livestore/
- https://github.com/livestorejs/livestore
- https://rxdb.info/replication.html
- https://github.com/Nozbe/WatermelonDB
- https://dexie.org/cloud/pricing
- https://www.instantdb.com/docs

Packaging

- https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API
- https://caniuse.com/background-sync
- https://wicg.github.io/background-sync/spec/
- https://developer.chrome.com/blog/background-sync
- https://developer.chrome.com/docs/workbox/retrying-requests-when-back-online
- https://developer.chrome.com/docs/workbox/modules/workbox-background-sync
- https://github.com/GoogleChrome/workbox/issues/1789
- https://developer.chrome.com/docs/capabilities/periodic-background-sync
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Periodic_Background_Synchronization_API
- https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- https://web.dev/articles/storage-for-the-web
- https://web.dev/articles/persistent-storage
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture
- https://capacitorjs.com/docs/guides/storage
- https://capacitorjs.com/docs/apis/camera
- https://capacitorjs.com/docs/apis/filesystem
- https://capacitorjs.com/docs/apis/background-runner
- https://docs.expo.dev/versions/latest/sdk/background-task/
- https://docs.expo.dev/versions/latest/sdk/background-fetch/
- https://docs.expo.dev/versions/latest/sdk/sqlite/
- https://docs.expo.dev/versions/latest/sdk/camera/

Auth

- https://www.better-auth.com/docs/plugins/jwt
- https://www.better-auth.com/docs/plugins/bearer
- https://www.better-auth.com/docs/integrations/expo
- https://www.better-auth.com/docs/concepts/session-management

Patterns

- https://www.rfc-editor.org/rfc/rfc9562.html
- https://www.postgresql.org/docs/release/18.0/
- https://www.postgresql.org/docs/18/functions-uuid.html
- https://www.ietf.org/archive/id/draft-ietf-httpapi-idempotency-key-header-07.txt
- https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/
- https://docs.stripe.com/api/idempotent_requests

Registry / repo metadata (2026-09-10)

- `npm view <pkg> version|time|dist-tags` for the packages named in §2
- `gh api repos/<owner>/<repo>` for licence, stars, `pushed_at`, `archived`
