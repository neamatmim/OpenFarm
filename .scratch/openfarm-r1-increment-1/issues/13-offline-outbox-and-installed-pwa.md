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

**Review outcomes folded in (follow-up commit).** The spec axis found the headline claim false, and it was right: the pen board read everything over the network, so with the network cut it sat on a spinner for ever — no claim button, no cow tiles, nothing to finish. The Outbox was only ever half the job. What the app has read is now kept on the device too, the service worker caches the built assets rather than a page that cannot boot, and a signed-in phone that cannot reach the farm is no longer sent to the login screen mid-shift with a morning's work in its queue.

Data loss the standards axis found in the queue itself:

- **An entry could exist in neither place.** Settling deleted the entry and then wrote the held row; a phone dying between the two lost exactly what "nothing is dropped" promises. Written first, deleted second, every time.
- **A crash between the farm answering and the phone putting the answer away** left a shorter batch under the same key — which the farm rightly refuses, and which would then have dumped the morning onto the refused list for retyping. The answer is written down before a single entry is acted on, so the next flush finishes the job instead of asking again.
- **Two taps in the same instant took the same sequence number.** The first fix was wrong in a way its own test caught: `??=` tests its target *before* evaluating what follows, so all three passed the test while the number was still unread. Checked after the wait now.
- **A farm merely busy discarded the queue**: every 4xx counted as permanent, so a 429 or a timeout handed a morning back for re-entry.
- **Being signed out did not survive a reload**, so the phone came back and hammered the farm.
- **A tile turned green with no queue to hold the work** — the one failure the whole file exists to prevent. Recording now refuses rather than appearing to take it.

Also: an Audit Event was written for a finish that changed nothing (a trail that lies); the transport seam was cast rather than typed, at exactly the point where a field mismatch loses work; the banner hid the sync age whenever the queue was empty, which is the one case the spec asks it for; the whole herd was re-read every fifteen seconds on a battery-limited phone; the resume button had no accessible name; and the photo bound sat in three files.

**The two that could be finished here, finished.**

- **A paused phone has somewhere to go.** The banner now links to the right place for the phone it is: a Shed Phone to its PIN screen, a personal phone to sign-in. Sending a milker to the wrong one of those, with a morning's work in the queue, is the kind of dead end that ends with the work being written on paper. Signing back in on a Shed Phone lets the queue go by itself; nobody has to know there was a queue.
- **A photo is shrunk on the device and queued on its own.** A camera makes three or four megabytes; a morning of those would sit in the Outbox and time out on every attempt, so each is scaled to fit and re-encoded before anything says the Step is done. It then travels as its own entry, against the slot of the Evidence it answers — which is what the spec asked for, and what stops a megabyte of image holding up a morning's litres. A Step may ask for two pictures (the udder and the tag), so `completion_photo` is keyed on the Completion *and* the slot; a photo that could not say which question it answered would be a photo nobody can read back. The figures go first, declaring which slots have pictures coming, and a picture whose entry never arrives is kept for a person rather than lost.

**Still not done, and honestly so:** none of the PWA behaviour — installing, persistent storage, opening with the network cut — has an automated test. That wants a device or a browser harness, and belongs with the deployment work where there is somewhere real to run it.
