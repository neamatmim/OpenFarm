# 05 — Ill again: outcome and count

**What to build:** The Vet can close a Diagnosis. The animal's page and the Manager's queue show how often she has been
ill.

**Blocked by:** —

- [ ] **Schema** (`health.ts:77`): `outcome` (recovered / not recovered), `closedAt`, `closedBy`. Vet only, Correction
      with a reason. A death is read from the Mortality, not typed.
- [ ] **Domain `illnessCount`** (pure): Diagnoses per animal over a Farm Parameter's days; a threshold puts her on the
      Manager's queue, as `repeatBreedersOn` does (`home.ts:99-104`).
- [ ] **Glossary:** widen **Diagnosis** with the outcome; **Cull Reason** per decision 7.
- [ ] **Tests:** a Correction of the outcome; a threshold crossed inside the window.
- [ ] **Somebody opens it:** her page and the Vet's close button. Both languages.
