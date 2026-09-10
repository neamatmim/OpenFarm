# Prototype: Barn Staff phone flow for one SOP

Status: resolved

Type: prototype

Blocked by: 05

Map: [OpenFarm Release 1](../map.md)

## Question

**HITL prototype via `/prototype`.** Build a throwaway clickable flow of a Barn Staff member on a phone: sees today's tasks → opens the milking SOP → completes steps per animal with evidence (a number, a tick) → submits, including what it looks like when offline.

Purpose: raise the fidelity of the SOP-shape and offline discussions by having the Owner and Manager react to something concrete, in Bangla. Not production code.

Link the prototype from the Answer. Resolved when the Owner and Manager have reacted and the changes to the SOP model (if any) are recorded back on [Shape of an SOP](./05-shape-of-an-sop.md).

## Answer

Built and reacted to on 2026-09-10. Prototype captured on branch **`prototype/sop-flow`** (commit `913336b`): `apps/web/src/routes/prototype/sop-flow.tsx` + `apps/web/src/prototype/*` + the shared `PrototypeSwitcher`. Run with `pnpm dev:web` on that branch, open `/prototype/sop-flow?variant=A|B|C`. Removed from `main`.

**Question**: what should a milker's phone screen look like while completing the morning milking SOP — in Bangla, with icons and photos, an offline banner with pending count, one cow under withdrawal (hard block to Discard), skip-with-reason, and bulk reconciliation?

**Variants**: **A** wizard (one cow at a time, big keypad, Next/Skip, progress bar) · **B** pen board (eight cow photo tiles, tap any, bottom-sheet entry, progress ring, lock icon on withdrawn cows) · **C** single sheet (whole SOP as one scrolling form, inline inputs, one submit).

**Verdict (Owner + Manager)**: **B's pen board with A's full-screen keypad entry sheet.** Tiles match how cows actually arrive at the parlour (not in order); the big keypad keeps entry fat-finger-proof; the progress ring and red locks read at a glance. A rejected as too rigid for the parlour; C rejected as too dense for the phone and for low-literacy staff.

**Changes to the SOP model**: **none** — the per-animal repeat block, evidence types, skip-with-reason, gate and reconciliation all held up on screen. UX decisions to carry into the spec:

- A group SOP instance renders its per-animal block as **tiles in any order**, not a forced sequence; completed tiles dim with a tick, withdrawn tiles carry a red ring and lock.
- Numeric evidence is entered on a **full-screen sheet with a large keypad**, Bangla numerals, unit label, and two actions: _skip_ and _confirm_ (the confirm label changes under a gate: "ফেলে দেওয়া হলো").
- Non-animal steps (prep, clean) sit as **chips above the tiles**; the bulk-total step appears only once all tiles and chips are done.
- The **offline banner** with pending count stays pinned at the top of every Staff screen.
