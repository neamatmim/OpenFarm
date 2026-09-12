# 43 — The Service

**What to build:** The cow is served — by a technician with a straw, or by the farm's own bull. The record says which, when, whose semen or which bull, and who did it. It is the event the whole rest of the chain counts from, so it has to be exact about the day.

**Blocked by:** 42

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 5, user story 67; [Breeding and reproduction](../../openfarm-release-1/issues/11-breeding-and-reproduction.md) (step 2); [Roles matrix](../../openfarm-release-1/assets/roles-matrix.md) — Breeding row.

- [x] A Service records AI or natural, the date and time, the sire (a straw's identity, or the farm's bull by Tag Number), and who served her
- [x] It is the Manager's alone to record — the roles matrix gives Service `C R U` to the Manager, `R` to the Owner, and nothing to Barn Staff or the Vet (their rows are Calving-as-a-step, and PD and Abortion). The technician or vet who actually served her is a fact on the record, not the person recording it
- [x] A Service is the AI work the Heat raised, done — not work closed beside it — so nobody is sent to serve a cow who has been served
- [x] Her page reads as a chain: the Heat, the Service it led to, and what followed
- [x] Tests cover an AI service, a natural one, the AI work finishing, and both a milker and the Vet being refused

## What was built

A `service` Step Effect. **The Service is the AI work its Heat raised, done** — recorded by the Step
that does the work, which then completes the normal way — rather than a record written somewhere
and a job closed beside it. It writes how she was served, the sire, who served her, the instant, and
which Heat it answered, read off the cause the work already carries. Her page reads as a chain: the
heat she was seen in, and the service it led to.

A natural service names a bull standing on this farm by his Tag Number; a tag that is not one is
refused, because a sire nobody can trace defeats the reason the record exists. AI takes the straw's
number as given. `ai` and `natural` are fixed words, like `heat`: the Step's labels are the farm's to
choose, but every later act in the chain reads the record back.

## The roles matrix, and a test that proved nothing

**The ticket was wrong before a line was written.** It said the Service was "the Manager's and the
Vet's to record", with Barn Staff recording one as a Step. The matrix gives Service `C R U` to the
Manager and nothing to Barn Staff or the Vet — their breeding rows are Calving-as-a-step, and the
Pregnancy Check and Abortion. The ticket was corrected first.

**My first refusal test passed for the wrong reason.** Barn Staff and the Vet were refused — but by
the Step's own gate, because the work is assigned to the Manager, not by the Service's check. Removing
that check left the test green. The case only the Service's own check covers is **the Owner**: the
Step gate always lets the Owner in to unstick a shift, and the matrix gives the Owner only read on a
Service. The test now tries the Owner on unclaimed work, and a mutation check confirms it goes red
without the gate. An Owner who does the breeding holds the Manager role too, and records under it.

**And a procedure could have handed a Service to the milkers.** Whoever the work is assigned to
completes it, so a Service procedure assigned to Barn Staff would have given them parentage the day
it was published. Publishing one assigned to anybody but the Manager is refused.

## Decisions and departures

- **No separate door for a natural service outside the Playbook.** "Recorded the same way", the
  decision says: a farm that runs a bull writes a procedure with a service Step, and the record and
  its gate are the same either way.
- **The audit trail records the Role the Step ran under**, which for an Owner-and-Manager may read
  "owner" though the Service needed the Manager role. The gate checks the person's Roles, not the one
  the Step picked; recorded rather than changed, since it is how every Step records its Role.

## Not done, and why

- **Nothing falls due from a Service yet.** The Pregnancy Check forty-five days on is ticket 44's.
- **A failed service is not yet counted as failed.** A negative Pregnancy Check says so (ticket 44).

## Verification

`pnpm check-types` clean with colour stripped; `pnpm test` 413 passing (384 api + 19 web + 10 i18n),
up from 408 — an AI service finishing its work and naming its heat, a natural service by the farm's
bull, a bull the farm does not have refused, the Owner refused on work the Step gate lets them into
(mutation-checked), and a service procedure assigned to Barn Staff refused at publish. `pnpm build`
clean; `oxfmt` and `oxlint` clean on every changed file.
