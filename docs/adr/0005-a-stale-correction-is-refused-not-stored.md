---
status: accepted
date: 2026-09-15
---

# A Correction made against a record that has changed since is refused, not stored as a Conflict Record

ADR 0002 said corrections carry an expected version and become a conflict record on mismatch. That was written for a correction held in a phone's Outbox, arriving hours after the record it corrects had moved on, with nobody there to decide again. No correction ever became offline: correcting a Step stays online-only (ADR 0004), and every other Correction — a Sale, a Dispatch, a Diagnosis, a Mortality — is made at a screen with signal. The only mismatch left is two people correcting the same record moments apart, and the person whose correction is stale is standing at the screen. We decided that a Correction carries, for each value it changes, the value the person was shown, and that when the record no longer holds that value it is refused with a conflict and the values it holds now; the screen shows them and the person decides again. Nothing unapplied is stored.

The values, rather than a version: a record is sometimes rewritten under another record's Audit Event — a stillborn calf's Mortality moves when her calving is re-dated, a Milk Record when its milking Step is corrected — so the latest Audit Event about a record can stand still while the record changes, and a version counter on every table is one more thing every write path must remember. Two people correcting different values of one record both stand, which is what each of them meant.

We rejected storing the stale correction as a Conflict Record for the Manager to settle: it is a table, a screen and a resolve flow for a race that is rare on one farm, and it asks somebody else to judge what the person who made it could judge at once. We rejected no version at all: the later correction would silently replace the earlier, and although the trail keeps both, the first person would believe their correction stands.

**Consequences**: this replaces ADR 0002's clause on corrections, and the glossary no longer has a Conflict Record; every Correction passes through one module that compares the values, so no correction procedure can forget it; a correction dialog sends back the values it was shown beside the values it sets. If a Correction ever becomes something the Outbox holds, this decision is reopened, because then nobody is at the screen when the mismatch is found.
