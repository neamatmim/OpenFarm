# 27 — A Diagnosis, and the Vet who makes it

**What to build:** The Vet records a Diagnosis on one animal, from their own phone, wherever they are — antibiotics need a registered practitioner's prescription, so the act is legally theirs and nobody records it for them. It reads back as one chain: what the round saw, what the Vet made of it, and what was done. The Vet is off-site more often than on it, so their way in has to work from outside the farm.

**Blocked by:** None — can start immediately.

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 3, user stories 49 and 50; [Health, medicine and withdrawal](../../openfarm-release-1/issues/08-health-medicine-and-withdrawal.md) ("Vet off-site").

- [x] Only a Vet may record a Diagnosis; there is no recording it on somebody else's behalf, and the refusal says why
- [x] A Diagnosis may answer an Observation, so the animal's page reads as one chain rather than two lists
- [~] The Vet reaches the farm from their own phone, off-site, and sees what they need and nothing else
- [x] A Diagnosis is correctable under the Vet's own correction window, and nothing is deleted
- [x] Tests cover the Vet recording one, everybody else being refused, the chain on the animal's page, and a correction

## How it was built

**The act is the Vet's, so the gate is the Vet's.** `diagnoses.record` and `diagnoses.correct` both sit behind `requireOnly("vet", …)` and `requirePersonalSession()`: no other Role may record one, and neither may a Shed Phone with the Vet PIN-switched in. `requireOnly` is new beside `requireRole` — a gate for work exactly one Role may ever do, whose refusal carries a reason instead of a bare "forbidden". Tickets 28 (Prescription) and 31 (Death and Cull) have the same shape, and the Drug List's three Vet-only procedures were moved onto it, so there is now one refusal shape (`forbidden(refusal)`) whether a gate raised it or a handler did.

**One chain, not two lists.** A Diagnosis may name the Observation it answers; the animal's page reads them nested — what the round saw, and beneath it what the Vet made of it — and a Diagnosis that answers nothing stands on its own in the same list. Answering another animal's Observation is refused, and so is answering one a Correction has withdrawn: hanging a conclusion off a note the farm has taken back would make the chain say something nobody stands behind.

**The Vet's window does not close, and it is theirs alone.** `mayCorrect` is asked only about their standing as the Vet (`roles: ["vet"]`, `isHealthEntry: true`) — an in-house Vet who is also the Manager would otherwise have a clinical Correction recorded under the Manager's Role, and the Manager has no business in the clinical record at all. A correction updates in place and the Audit Event chain holds every version, its reason and its order; a second Vet may read a conclusion but not rewrite it.

**Nothing was named twice.** The glossary already had Diagnosis, and its `_Avoid_` list already said not to call one a "condition" — which is exactly what the column was called on the first pass. Renamed to `disease` throughout, which is also the word ticket 32 will match against the notifiable-disease list.

## Cut, and owed

- **The visiting Vet's scope is not built.** The roles matrix says "Vet (visiting): only animals with an open case they are on, plus herd health summaries; access granted per visit by the Manager (Owner approves), time-limited". None of that exists: `ROLES` holds four bare names, so `diagnoses.waiting` shows every unanswered Observation on the farm and `record` accepts any tag. What is built serves the **in-house** Vet completely. A time-limited, per-visit grant is an access-granting feature of its own — an Owner decision about who may see the herd and for how long — and it wants its own ticket. This is the third acceptance criterion, marked `[~]`: the Vet reaches the farm from their own phone and sees a screen built for them, but "nothing else" is only true of an in-house Vet.
- **Which Observations want a Vet, the farm cannot yet say.** Every choice a round offers is recorded, including the ones that say she is well, and nothing in a Version marks which of them calls for a Vet. So the queue is everything unanswered, narrowed by the word the farm used. Marking choices as vet-worthy is a change to SOP content — the Owner's call.
- **A Diagnosis on an animal that has left is refused** (`loadLiveAnimal`, the rule every other animal write follows). Post-mortem findings therefore have no home yet; ticket 31 (Death and Cull) is where that belongs if the Owner wants them.
- **`diseaseEn` is written by no screen.** Same as the Drug List's `nameEn`: the schema keeps room for English and the Bangla-first screen writes Bangla.

## Review outcomes folded in

Two-axis review of `5557ff1`; both axes found real things, and everything below is in the final commit.

- **Standards — the column contradicted the glossary.** The commit added "condition" to Diagnosis's `_Avoid_` list and then named the column `condition`. Renamed to `disease`/`diseaseEn` everywhere, and the un-applied migration regenerated rather than patched.
- **Spec — Barn Staff could read the clinical record.** `animals.byTag` returned the Vet's conclusions to everybody who could look up a tag. The matrix gives Staff "R (treatment instances only)", so `byTag` now returns the round's own Observations to Staff and no conclusions. Tested.
- **Both axes — the Vet's queue dropped cases silently.** `waiting` took 200 rows and then filtered the answered ones out in JavaScript, so a fortnight of daily health walks on 100–500 head would hide real work behind answered notes. Now `not exists (select 1 from diagnosis …)` in the query, so the exclusion happens before the limit.
- **Spec — there was no form for a Diagnosis that answers nothing.** The API allowed it and a test covered it, but the screen only offered the form inside an unanswered Observation. Added the standalone form.
- **Spec — refusals reached the Vet in English.** `vet.tsx` was showing `error.message`; `refusalMessage` already existed for exactly this and is now used, so a closed window is read in the reader's own language.
- **Spec — `record` used a raw lookup instead of `loadLiveAnimal`**, the helper every other animal write uses. The whole check now happens inside the audited transaction, so the trail cannot record a Diagnosis against a cow who left between the check and the write.
- **Standards — the Vet's queue duplicated `observations.recent`.** The window filter and its input schema now live once in `health-store.ts` (`seenLately`, `seenLatelyInput`) and both routers ask the same question with a different default — a week for the Manager, a fortnight for the Vet.
- **Standards — the chip row was duplicated** between the Manager's observations screen and the Vet's. Extracted as `SawFilter`.
- **Standards — two audit shapes for one entity.** `record` hand-built its `after` and lost `diseaseEn`; both now read through `readDiagnosis`, so the trail holds one shape.
- **Standards — the animal page's heading lied** (it said "what was seen" but rendered for a standalone Diagnosis too) and wrapped a one-item list in a list item. Both fixed.
- **Standards — `Refusal.reason` was a bare string.** Typed as `RefusalReason`, so a new reason is a decision taken in the code rather than a blank line on somebody's phone.
- **Spec — no test used a second Vet.** The harness gained an `otherVet` Principal (a farm has more than one Vet), and the test proves they may read a conclusion and not rewrite it.
- **Test naming**: `her` had meant three different things in one file.

Not taken: `DAY_MS` has five copies under `packages/api/src`; the two this ticket touched are gone, and unifying the rest is a repo-wide change of its own.

## Honestly

Only the first test was red-first. The router's four procedures were written in one pass after it, so the refusals, the queue and the correction were verified after the fact rather than driven by a failing test — which is how the queue's filter-after-limit bug survived my own testing and had to be caught by review.
