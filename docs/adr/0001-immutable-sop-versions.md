---
status: accepted
date: 2026-09-10
---

# SOP Definitions are immutable Versions; Instances pin the Version they started on

OpenFarm enforces the farm's Playbook, and a DLS inspector or a buyer may ask what procedure was in force on a given day. We decided that every change to an SOP Definition creates a new immutable Version, that an SOP Instance records the Version it was created from and finishes on it even if a newer Version is published mid-way, and that history always shows which Version each completion followed. Edit-in-place would have been simpler to build and to author, but it makes "what did the milking procedure say last March?" unanswerable and lets a half-done instance change under staff's feet; switching in-flight instances to the new Version was rejected for the same reason.

**Consequences**: SOP content (names, steps, choices, both languages) is stored per Version; the Owner's approval of a Manager's proposal is what publishes a Version; a Version can never be deleted, only superseded; reports that aggregate across Versions must be explicit about it.

Decided on the wayfinder map: `.scratch/openfarm-release-1/issues/05-shape-of-an-sop.md`.
