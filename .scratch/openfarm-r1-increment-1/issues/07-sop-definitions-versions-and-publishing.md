# 07 — SOP Definitions, Versions and publishing

**What to build:** The Owner authors the milking SOP in Bangla: name, purpose, a schedule Trigger (two Milking Sessions), assigned role Staff, checker role Manager, due time and grace window, and ordered Steps — including a Step marked _repeat per animal_ with number Evidence (litres, unit, sane range), tick Steps with optional photo, and a final number Step for the Bulk total. Skip reasons are part of the Version. Publishing requires complete Bangla content and creates an immutable Version. The Manager can propose a change; the Owner approves it, which publishes a new Version. In-flight Instances (from 08) keep the Version they started on. (ADR 0001.)

**Blocked by:** 04

**Status:** done (2026-09-11)

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 1.

- [x] Owner can create and edit a Definition; publish creates Version 1; any later edit creates a new Version and never mutates an old one
- [x] Publish is refused with the missing fields named if any Bangla name, step text, choice or skip reason is empty; English is optional
- [x] Step Evidence types tick, number (unit + range), choice, photo, note are supported, each required or optional; a Step can be marked repeat-per-animal
- [x] Manager can submit a proposal (a draft diff) that the Owner approves or rejects; approval publishes a new Version
- [x] Tests cover immutability, Bangla validation, proposal → approval, and that a Version's content is retrievable by number

**Done note:** ADR 0001 in code. `sop_definition` persists; what it _says_ lives in `sop_version` rows that are **never updated** — publishing appends the next numbered Version and repoints the Definition, so any Version is retrievable by number and the farm can show what was in force on a date. `sop_proposal` carries a Manager's draft with the Version it was based on; approving publishes, rejecting publishes nothing, and neither decision can be made twice (both are keyed on `status = pending` in the update predicate). Content is a JSONB document whose shape and rules live in `@OpenFarm/domain` (`SopContent`, `findPublishBlockers`), so the editor refuses to publish for exactly the reasons the server would — including naming the missing Bangla paths (`steps[0].text.bn`) while leaving English optional, and catching structural nonsense (no steps, `25:00`, a range that runs backwards). Authoring is Owner-only and `requirePersonalSession()`, so the Playbook can never be rewritten from a shared shed phone.
