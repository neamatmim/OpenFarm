# Audit trail and correction rules

Status: resolved

Type: grilling

Blocked by: 02

Map: [OpenFarm Release 1](../map.md)

## Question

**Research says** (see [Bangladesh regulatory requirements](./02-bangladesh-regulatory-requirements.md)): no statutory retention period exists; the DLS guideline says "minimum 3 years"; slaughter rules look back 30 days (treatments) and 6 months (disease history). Recommend: retain everything indefinitely, guarantee at least 3 years.

**Grilling.** Audit trail is a chosen enterprise guarantee. Decide the rules, informed by retention obligations from [Bangladesh regulatory requirements](./02-bangladesh-regulatory-requirements.md):

- What is audited: every record change, every SOP completion, logins, permission changes?
- Immutability: can anything be deleted? Recommended: never delete — correct with a reason, keeping the original visible.
- Who can correct what, and within what window (e.g. Barn Staff can fix their own entry within 1 hour; after that Manager only)?
- Time source: phone clock vs server time for offline entries — what's recorded?
- Who can view the audit log; retention period.

Resolved when the audit rules are written down.

## Answer

Decided with the Owner on 2026-09-10.

### What is audited

**Every state change**, as one append-only **Audit Event** written in the _same transaction_ as the change: record create/correct, every Step Completion, sign-off, missed-closure, SOP publish, ration/parameter change, user & role change, login, and every **export generated**. Each event carries: actor, **Role used**, device id + sequence, **both clocks** (`recorded_at` device, `received_at` server), idempotency key, entity + action, and the before/after payload. Reads are not audited (except exports).

### Nothing is deleted

A wrong entry is **superseded by a Correction** that points at the original, carries a **reason**, and leaves the original visible in history. No delete operation exists for farm records.

### Correction windows (farm parameters)

| Who | May correct | Until |
| --- | --- | --- |
| Staff | their own entries | **2 hours** after entry |
| Manager | any entry | **30 days** |
| Owner | anything | any time |
| Vet | their own health entries (Diagnosis, Prescription, doses they gave) | any time |

Withdrawal shortening stays **Vet-only** regardless (health model).

### Corrections with effects

A Correction **re-runs the effects of the corrected record and records that it did**: correcting a dose recomputes the withdrawal end (Vet-only); correcting litres recomputes the session's Bulk reconciliation; correcting a weigh-in recomputes gain and readiness suggestion. Effects that **cannot be safely undone** — a calf record from a corrected calving, an animal exited by a corrected sale — **stay and are flagged for the Manager** (`needs_review`); correcting a Sale requires the **Owner** and re-opens the animal as needs-review rather than silently un-selling.

### Retention & access

**Indefinite. Nothing is purged in Release 1.** Guaranteed ≥ 3 years (DLS guideline) with **off-site backups** — cadence and recovery targets are a separate ticket. Audit log readable by Owner and Manager in full; every other role sees their own actions (roles matrix).

### Consequences

- Data model: every domain table pairs with the audit table; corrections are new rows with `supersedes_id`, never `UPDATE`s of facts.
- Offline: the outbox already supplies device id, seq, both clocks and idempotency key — the audit row is written server-side from those.
- Backups/DR: graduated to [Backups and disaster-recovery targets](./24-backups-and-disaster-recovery.md).
