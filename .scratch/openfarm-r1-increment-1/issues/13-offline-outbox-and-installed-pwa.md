# 13 — Offline outbox and installed PWA

**What to build:** The web app is an installable PWA with persistent storage. Barn Staff capture Completions, Moves and photos with no signal; entries go into a durable outbox before the UI updates and are sent FIFO through the batch procedure when signal returns, with backoff and one idempotency key per transaction. On 401 the outbox pauses and asks the active user to re-authenticate (PIN Switch or login) without losing anything. Per-entry rejections stay on the phone with their data for re-entry; Needs Review acknowledgements are shown. A banner pinned on every Staff screen shows the pending count and the age of the last sync. The user's assigned Pens' animals, States, Withdrawal status and photos are cached at each sync.

**Blocked by:** 06, 12

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 1.

- [x] The app installs to the Android home screen and requests persistent storage; the outbox survives app restarts
- [x] With the network cut, a full milking Instance can be claimed and completed; on reconnect it syncs in order and the server state matches
- [x] One idempotency key per outbox transaction, reused on retry; retries back off with jitter; only one tab syncs
- [x] On 401 the outbox pauses with a visible prompt; after re-auth it resumes with nothing lost
- [x] Rejected entries are listed for re-entry with their original data; Needs Review outcomes are shown
- [x] The pending-count and sync-age banner is present on every Staff screen; gates render from cached state
- [x] Secondary-seam tests against a fake transport cover ordering, replay, pause-on-401, rejection retention; one end-to-end test runs a real batch against the scratch database

**Where this stands.** The outbox, the PWA shell and the banner are built and tested; two acceptance criteria are only partly met, and one decision departs from the ADR. Both are called out below rather than buried.

**Built.** A durable Outbox over IndexedDB: entries go in before the screen says anything happened, they are sent oldest-first under one key that outlives every retry, backoff is exponential with jitter, and only one tab sends. On a 401 it stops, says so on the banner, and loses nothing; after signing in again it resumes with the same key, because signing in is not new work. Entries the farm refuses stay on the phone with the data the person typed; entries the farm keeps for review leave, because they are the farm's business from then on. A batch is bounded by weight as well as count, so three shed photos do not become a request no phone on a weak signal will finish. The app installs from a manifest, registers a service worker that caches the shell (and deliberately caches no API call — a worker replaying a POST would be a second write path, which ADR 0002 rules out), and asks the browser to keep its storage. The banner is on every signed-in screen.

**Decisions worth remembering:**

- **A phone that was out of signal all morning is not a phone with a wrong clock.** The first cut compared each entry's `recorded_at` against the server's clock and called the difference skew — which would have flagged every entry an outbox ever held. The batch now carries the phone's own clock at the moment it sends, and skew is that against the farm's. An entry being hours old is exactly what the outbox is for.
- **A photo travels with the entry it is evidence for.** It was taken with no signal and proves that Step; separating them would mean two things to reconcile later.
- **The service worker does not touch the API.** Reads that matter offline are held by the app; every write goes through the Outbox.

**Departure from ADR 0002, for the Owner to accept or reject.** The ADR names *TanStack DB with `@tanstack/offline-transactions`*. The library is installed and used for the parts that are genuinely hard to get right — IndexedDB storage, backoff with jitter, Web Locks leader election, online detection — but its queue and its `createOfflineAction` are built on TanStack DB collections, which would mean a second data model beside TanStack Query and a rewrite of how every screen reads. The queue itself is therefore ours, over the library's storage adapter. The ADR's substance holds: an on-device outbox, oRPC the only write path, one idempotency key per transaction, both clocks stored. If the Owner wants the collection model adopted properly, that is a ticket of its own and this is the point to say so.

**The last three, finished.**

- **A whole shift now fits in the Outbox.** Claiming and finishing are entries like any other, so a milker with no signal from the moment they walk into the shed can take the work, record every cow, and finish — and the farm reads it back in the order the shed did it. Claiming had to stop being a permission question to make that work: *somebody else is holding this* is the world having moved, which is exactly what happens to a phone out of range, so it is kept for a person rather than handed back. The same goes for finishing on a Pen that has gained a cow since the phone last saw it.
- **Finishing twice changes nothing** rather than being refused, because a replayed outbox sends what it sent.
- **What the phone is carrying has a screen.** Entries the farm sent back are listed with the figures the person typed, so they can be put in again; entries the farm took but put in front of somebody are listed too, because the person who recorded them should hear that they did not simply go in. Nothing leaves the phone until the person says it may.
- **The Pens' animals are cached at every sync** — which cow, and whether her milk may go to the tank — and the pen board renders the Gate from whichever it has. A shed with no bars is exactly where that mistake gets made. The farm decides again when the entry lands; the cache is what the phone shows, not what the farm believes.
