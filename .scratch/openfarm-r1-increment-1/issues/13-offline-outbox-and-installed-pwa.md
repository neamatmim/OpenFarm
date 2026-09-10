# 13 — Offline outbox and installed PWA

**What to build:** The web app is an installable PWA with persistent storage. Barn Staff capture Completions, Moves and photos with no signal; entries go into a durable outbox before the UI updates and are sent FIFO through the batch procedure when signal returns, with backoff and one idempotency key per transaction. On 401 the outbox pauses and asks the active user to re-authenticate (PIN Switch or login) without losing anything. Per-entry rejections stay on the phone with their data for re-entry; Needs Review acknowledgements are shown. A banner pinned on every Staff screen shows the pending count and the age of the last sync. The user's assigned Pens' animals, States, Withdrawal status and photos are cached at each sync.

**Blocked by:** 06, 12

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 1.

- [ ] The app installs to the Android home screen and requests persistent storage; the outbox survives app restarts
- [ ] With the network cut, a full milking Instance can be claimed and completed; on reconnect it syncs in order and the server state matches
- [ ] One idempotency key per outbox transaction, reused on retry; retries back off with jitter; only one tab syncs
- [ ] On 401 the outbox pauses with a visible prompt; after re-auth it resumes with nothing lost
- [ ] Rejected entries are listed for re-entry with their original data; Needs Review outcomes are shown
- [ ] The pending-count and sync-age banner is present on every Staff screen; gates render from cached state
- [ ] Secondary-seam tests against a fake transport cover ordering, replay, pause-on-401, rejection retention; one end-to-end test runs a real batch against the scratch database
