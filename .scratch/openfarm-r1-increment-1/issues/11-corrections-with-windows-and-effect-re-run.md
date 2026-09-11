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
- **The Correction *is* the row that supersedes.** Farm records are never deleted and `step_completion` holds one row per Step per animal, so the Completion carries the current truth and the Audit Event chain carries every version it has ever held, each with its reason and the Role it was made under.
- **The window is measured on the farm's clock**, not the phone's. A Correction Window measured on a device's own time would be a window the device could widen.
- **Effects re-run from the Completion.** They were already keyed on it and idempotent, so a corrected litres figure replaces its Milk Record and the Session's reconciliation is worked out afresh — including un-flagging a Session whose difference the correction closes.
- **Needs Review is raised inside the Correction's own transaction.** A Correction whose flag went missing is worse than no Correction at all. That needed the foreign key from `needs_review` to `audit_event` to be deferrable, because the Audit Event is written last — deliberately, so a write that throws leaves no trail entry claiming it happened.
- The seeded irreversible case is **a Correction to work a checker has already signed off**: the system cannot unsign it, so it says so and the Manager decides. Closing one asks for the judgement rather than offering a tick.
- `audited()`'s `apply` is now handed the id its Audit Event will be written under, so a write that has to point at its own trail entry can do it without hoping a second transaction succeeds.

The Alert sweep changed shape as part of this. The batch cap it had been given was starving older work — once the newest slice had all been told, the sweep reported nothing to do while older work sat untold for good. It now sweeps **from wherever the last sweep reached**: a farm nobody opened for a week comes back to the week it missed, a farm opened twice in a minute reads almost nothing, and a new farm starts noticing on the day it is installed rather than by announcing its whole history. Each kind is measured at its own moment, because an Instance goes Overdue at one instant and becomes the Owner's business at a later one.
