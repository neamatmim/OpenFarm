# 03 — The Vet told when no Diagnosis was named

**What to build:** A death or a cull written with no Diagnosis of hers tells the Vet at once: her tag, died or culled,
the cause as the farm wrote it, and a tap opens her page and the photograph — never what she cost.

**Blocked by:** 02

**Status:** done (2026-10-03).

**As built:** notice `mortality_undiagnosed` (immediate, not waking), every Vet holding the farm's role in full — a
visiting Vet hears only their own Cases, as `holdersOf` already says — with the writer left out as 02's. Raised by
`tellOfTheDeath` beside the Owner's when the Mortality names no Diagnosis, and pushed with it.

- [x] **Glossary:** **Mortality** widened — the Vet is told when no Diagnosis was named.
- [x] **Notice:** new kind `mortality_undiagnosed` — `ALERT_KINDS`, `DELIVERY` immediate and not waking, `SAYS`,
      `NOTICES` the Vet (every Vet the farm holds) with the writer left out as 02's; facts `{ tag, kind, cause }` in
      `notice-facts.ts` and filled in FILLINGS (`notice-words.ts`).
- [x] **Rule:** raised beside 02's, in the same write, when no `diagnosisId` is linked, and pushed with it. A
      Correction linking a Diagnosis afterwards tells nobody and takes nothing back. The push opens her page, which the
      Vet already reads (`animals.photo`, `routers/animals.ts:1376-1378`; the death's photographs by 01).
- [x] **Screen:** the Vet's list shows it, linked to her page; nothing else changes.
- [x] **Tests:** `routers/death-told-vet.test.ts`. **First, red before the fix:** a Manager records a death with no
      Diagnosis — the Vet holds a `mortality_undiagnosed` notice and one push, and its facts carry no cost (today
      nothing). Then: with her Diagnosis linked the Vet is not told and the Owner still is; a stillborn calf at her
      disposal tells the Vet; a Correction tells nobody. **Proved by switching off** the no-Diagnosis condition (the
      Diagnosis-linked test red).
- [x] **Somebody opens it** (seed): signed in as the Vet after the Manager's death with no Diagnosis — the notice names
      her tag and cause, no taka, and opens her page on the photograph.
