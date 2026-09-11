# 11 — Corrections with windows and effect re-run

**What to build:** A person can correct an entry within their Role's Correction Window with a reason; the original stays visible and a Correction row supersedes it. Correcting a litres entry recomputes that Session's reconciliation; correcting a Completion re-runs its effects idempotently. Windows: Staff 2 hours on their own entries, Manager 30 days on any, Owner always, Vet always on their own health entries — all farm parameters. Sale corrections (Owner-only) and irreversible-effect flagging are specified for later increments but the flagging mechanism (Needs Review on the Correction) exists now.

**Blocked by:** 09, 10

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 1.

- [x] Correcting within the window succeeds and produces a Correction row plus Audit Event; outside the window it is refused with the window named
- [x] A corrected litres value updates the Milk Record via supersession and recomputes the Bulk reconciliation flag
- [x] The original entry remains readable in history alongside the Correction and its reason
- [x] A Correction that would need an effect the system cannot undo marks itself Needs Review for the Manager (mechanism tested with a seeded case)
- [x] Tests cover each Role's window with the controllable clock

**How it was built.** Recording a Step again while you are still doing the work is just recording — that is the barn flow, and it needs no ceremony. Changing something already recorded is a **Correction**: it carries a reason, it is bounded by the Role's Correction Window, and it supersedes the entry it replaces in the trail rather than quietly overwriting it.

Decisions worth remembering:

- **The Completion is its own entity in the trail.** It was audited against its Instance before; now it has its own history, so a Correction has something precise to supersede and an entry reads back on its own. `audited()` grew a lazily-resolved `entityId` for this: an upsert keeps the existing row's id, and an event keyed on the id we hoped for would point at nothing.
- **The Correction _is_ the row that supersedes.** Farm records are never deleted and `step_completion` holds one row per Step per animal, so the Completion carries the current truth and the Audit Event chain carries every version it has ever held, each with its reason and the Role it was made under.
- **The window is measured on the farm's clock**, not the phone's. A Correction Window measured on a device's own time would be a window the device could widen.
- **Effects re-run from the Completion.** They were already keyed on it and idempotent, so a corrected litres figure replaces its Milk Record and the Session's reconciliation is worked out afresh — including un-flagging a Session whose difference the correction closes.
- **Needs Review is raised inside the Correction's own transaction.** A Correction whose flag went missing is worse than no Correction at all. That needed the foreign key from `needs_review` to `audit_event` to be deferrable, because the Audit Event is written last — deliberately, so a write that throws leaves no trail entry claiming it happened.
- The seeded irreversible case is **a Correction to work a checker has already signed off**: the system cannot unsign it, so it says so and the Manager decides. Closing one asks for the judgement rather than offering a tick.
- `audited()`'s `apply` is now handed the id its Audit Event will be written under, so a write that has to point at its own trail entry can do it without hoping a second transaction succeeds.

The Alert sweep changed shape as part of this. The batch cap it had been given was starving older work — once the newest slice had all been told, the sweep reported nothing to do while older work sat untold for good. It now sweeps **from wherever the last sweep reached**: a farm nobody opened for a week comes back to the week it missed, a farm opened twice in a minute reads almost nothing, and a new farm starts noticing on the day it is installed rather than by announcing its whole history. Each kind is measured at its own moment, because an Instance goes Overdue at one instant and becomes the Owner's business at a later one.

**Review outcomes folded in (follow-up commit).** The spec axis found the hole this ticket was meant to close still open, and two ways the sweep could lose work:

- **The Correction Window was bypassable, and the original value was nowhere.** Recording a Step again on an open Instance still upserted straight over the Completion — no reason, no window, and an Audit Event with no `before`. A Staff member who entered 10 litres at half past five and 3 litres at two in the afternoon left no trace that it had ever been ten. Recording is now for entries that do not exist: an identical one arriving again is the phone replaying its outbox and changes nothing (ADR 0002), and a different one is refused and sent to `correctStep`, which asks why and checks the window.
- **The sweep's watermark stepped over its own backlog.** It moved to the moment of the oldest notice it had sent, and everything left over was older than that, so a farm with more than one batch of untold work lost the remainder for good. The window now stays open over anything a sweep did not reach.
- **Work that became late retroactively was never told.** The day's Instances are raised when someone opens the app, so an SOP published at eleven raises one that was due at five and is already late — older than the watermark, and therefore invisible. Instances raised since the last sweep now come in on their own account, whatever they were due.
- **A Vet had an unlimited window over the milking book.** The decision doc gives the Vet their unlimited window over *health entries* — a Diagnosis, a Prescription, a dose they gave. Health arrives in increment 3; until then there is no such entry, and being a Vet is not a licence over the milking book. The test that asserted otherwise was the bug, written down.
- **The refusal named a window that had never been running.** Someone with no standing over an entry was told their two hours were up, sending them to look for a clock that had never started.
- Needs Review Alerts went to the Owner as well as the Manager; the notification table says Manager.

From the standards axis: a duplicate **Correction Window** and **Needs Review** in the glossary — the second time this session, so the habit is now written down — where the standing **Needs Review** described a different trigger and has been widened to cover both. The server composed its refusal as an English sentence and showed it to Bangla-reading Staff; it now returns the facts and the phone writes the sentence. The skip path filled in a Correction's reason with the skip label when the person typed nothing, defeating the guard that a Correction carries a reason. The Audit Event recorded the highest Role held rather than the one whose window actually allowed the Correction. And: `MAX_GRACE_MINUTES` now comes from the domain that enforces it rather than being restated in the sweep, `batch` is `takeUntold`, `withPen` re-queried an Instance it already held and fell back to an empty Pen name, `review.open` shipped whole before-and-after snapshots to the client, and the client's reason map is typed by the reason.
