# 05 — No Release while an arrival dose is owed

**What to build:** A bull is not let out of Quarantine — by the Release Step or by hand — while an arrival dose is still
owed him, unless the Vet has written why it is not needed. With no dose procedure adopted, nothing is owed and the
Release works as today.

**Blocked by:** 04

**Status:** done (2026-10-03).

**As built:** `excused_dose`; `assertNoDoseOwed` and `excuseArrivalDose` in `put-off-store.ts` (the owed rule lives
with 04's `arrivalDosesOwed` in the api, not the domain); the gate in the Release effect and in `setState` leaving
Quarantine; `treatments.excuseArrivalDose`, Vet only. His page's "দেওয়া বাকি" gains "দরকার নেই" for the Vet and
reads an excused one as the Vet's word; the Release on the board names what is owed; the by-hand change of state is
dimmed with the same words. Seed: F-0045 is unwell from his ninth day, so his drench, FMD and LSD are owed.

- [x] **Glossary:** new **Excused Dose** — the Vet's written reason, for one bull and one arrival dose, that it is not
      needed: it is no longer owed, its again-work is called off, and the Release may go ahead. The Vet's alone, from
      their own account; kept, never removed. **Release** widened (refused while an arrival dose is owed and not
      Excused, whether by its Step or by hand). Checked against CONTEXT.md: not a **Write-off** (money), not **Set
      Aside** (the Manager's answer to a Suggestion), not **Skipped** (a Step passed over).
- [x] **Schema:** `excused_dose` (farm, animal, SOP definition, reason, by — the Vet —, at); one per animal per
      procedure. Migration `…_excused_dose`, both dev databases.
- [x] **Rule:** domain `arrivalDosesOwed(work, given, excused, now)` — for each arrival-dose procedure raised for him
      (04's `isArrivalDose`) with work due by now: owed while no dose under it (its again-work included) was given and
      it is not Excused; Called Off work is not owed. Nothing raised, nothing owed.
- [x] **Entry:** the Release Effect (`effects/release.ts:64`, before `entersState`) and `setState` from Quarantine
      (`routers/animals.ts:1013`) refuse `arrival_dose_owed`, naming the doses — one gate, two doors.
      `treatments.excuseArrivalDose({ tagNumber, definitionId, reason })` — Vet only, personal session, audited; a
      dose not owed refused `dose_not_owed`. Words for both in `apps/web/src/lib/correction-refusal.ts` and the entry
      refusals a phone's Batch shows.
- [x] **Screen:** his page's "Still owed" (04) gains, for the Vet, "দরকার নেই / Not needed — why"; an Excused dose
      reads "ভেট: দরকার নেই — <reason>". The Release Step on the board says the doses owed before it is ticked, and the
      by-hand State change is dimmed saying why.
- [x] **Tests:** `routers/release-owes-doses.test.ts` — no dose procedure adopted: released as today; FMD skipped:
      Release Step refused `arrival_dose_owed`, by-hand refused the same; FMD given on its again-work: released; the
      Vet excuses it with a reason: released, again-work called off; a Manager may not excuse; a dose not yet due is not
      owed. **Proved by switching off** the Effect's gate, the by-hand gate, the Excused read and the Vet-only gate —
      each red.
- [x] **Somebody opens it** (seed, the arrival FMD procedure adopted in the dev database): skip a bull's FMD, try his
      Release and read the refusal in Bangla; sign in as the Vet, excuse it with a reason, and release him.
