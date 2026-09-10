# 07 — SOP Definitions, Versions and publishing

**What to build:** The Owner authors the milking SOP in Bangla: name, purpose, a schedule Trigger (two Milking Sessions), assigned role Staff, checker role Manager, due time and grace window, and ordered Steps — including a Step marked *repeat per animal* with number Evidence (litres, unit, sane range), tick Steps with optional photo, and a final number Step for the Bulk total. Skip reasons are part of the Version. Publishing requires complete Bangla content and creates an immutable Version. The Manager can propose a change; the Owner approves it, which publishes a new Version. In-flight Instances (from 08) keep the Version they started on. (ADR 0001.)

**Blocked by:** 04

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 1.

- [ ] Owner can create and edit a Definition; publish creates Version 1; any later edit creates a new Version and never mutates an old one
- [ ] Publish is refused with the missing fields named if any Bangla name, step text, choice or skip reason is empty; English is optional
- [ ] Step Evidence types tick, number (unit + range), choice, photo, note are supported, each required or optional; a Step can be marked repeat-per-animal
- [ ] Manager can submit a proposal (a draft diff) that the Owner approves or rejects; approval publishes a new Version
- [ ] Tests cover immutability, Bangla validation, proposal → approval, and that a Version's content is retrievable by number
