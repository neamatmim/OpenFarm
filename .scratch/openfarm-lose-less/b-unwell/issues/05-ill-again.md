# 05 — Ill again: outcome and count

**What to build:** The Vet can close a Diagnosis. The animal's page and the Manager's queue show how often she has been
ill.

**Blocked by:** —

**Status:** done, 2026-09-30.

- [x] **Schema:** `diagnosis.outcome` (`recovered` / `not_recovered`, `DIAGNOSIS_OUTCOMES`), `closed_at`, `closed_by`. A
      death is her Mortality, not an outcome.
- [x] **The Vet's close:** `diagnoses.close` — the Vet's own act, once; closing again is refused (`outcome_said`: "put it
      right instead"). Changing it is the Diagnosis Correction, which now carries `outcome`, with its reason.
- [x] **Domain `illAgainOf`** (pure, `health.ts`): Diagnoses per animal within the farm's days, the farm's number or
      more, most diagnosed first then the latest; `illAgainOn` (health store) for animals still on the farm.
- [x] **Farm Parameters:** `ill_again_diagnoses` (3) and `ill_again_days` (365), the Manager's to set; group "Ill again
      and again".
- [x] **Manager's queue:** "Ill again and again" ("বারবার অসুস্থ") after the repeat breeders — her tag, how many, the
      latest disease and day — opening her Health tab. **Decision 7:** the list only, not a Cull Reason; never pushed.
- [x] **Her Health tab:** each Diagnosis shows how it ended ("সেরে উঠেছে" / "সারেনি" with the day); the Vet gets the two
      buttons while nobody has said.
- [x] **A visiting Vet** may close a Diagnosis on the cases they were called in on, as they may correct one: `diagnoses.close` is on `visiting-scope.test.ts`'s list, and the scope check inside still refuses another animal's. The full run caught it.
- [x] **Glossary:** **Diagnosis** widened.
- [x] **Tests:** `routers/ill-again.test.ts` (4) — listed at the third Diagnosis within a year with the latest, not at
      two; one older than the days forgotten; the Vet says it once and puts it right with a reason; not the Manager's.
      `health.test.ts` (3) for `illAgainOf`. **Proved by switching off** the threshold (2 red), the "said once" guard (1
      red) and the domain's window (1 red; the store's query window also guards it, as the heat did in 01).
- [x] **Somebody opens it** (seed, 2026-09-30): the Vet diagnosed D-0045 three times; her Health tab showed the two
      buttons under each, and "সেরে উঠেছে" turned into a green badge with the day; the Manager's home had "বারবার অসুস্থ
      ১" with "D-0045 — ৩ বার রোগ নির্ণয়; সর্বশেষ ওলান প্রদাহ, ৩০ সেপ্টেম্বর, ২০২৬".
