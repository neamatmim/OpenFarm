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

## What the review changed

The spec axis found the gap I had been uneasy about, and it was worse than uneasy.

- **A bull running with the herd had no way to record a service at all.** The effect refused work
  that was not about one cow, and the Step's shape refused a per-animal Step — so only work a Heat
  raised could carry a Service. A bull serves cows nobody saw in heat, and my own "Decisions" note
  claimed a path that did not exist. The Pregnancy Check, Expected Calving and the Repeat Breeder
  count all start from that event. A Service Step may now be walked animal by animal, on a round no
  heat raised, and it records `heatId` as null rather than pretending a heat came first.
- **A bull could be recorded as served.** Nothing checked the animal's sex. My first attempt at
  the check never landed — its anchor had been reformatted — and the new test for it went red
  against the code as it stood, which is how I found out. It is there now.
- **An AI service was accepted with nobody named.** The story asks for "the sire and the
  technician". An AI service is refused without a name; a bull running with the herd, who has
  nobody standing over him, is not.
- **The criterion named the milker and the Vet being refused, and I had dropped those tests.**
  They were refused by the Step's gate rather than the Service's — which is still the behaviour the
  criterion describes. They are back, beside the Owner test that actually guards the Service's own
  check.

The standards axis found how the Step's shape was read:

- **The Step was validated by position and read by counting notes**, so a Step shaped
  `[choice, note, photo, note "remarks"]` passed and saved the remarks as who served her. One
  `SERVICE_EVIDENCE` table of positions is used by both now.
- **The cause string was agreed by convention in four places** — built in the slot builder, parsed
  in the effect, rebuilt on her page, matched in the correction that takes a Heat's work back. One
  `causeOf`, `heatKeyOf` and `heatThatRaised` beside the `Happening` type.
- **The trail could say "owner" recorded a Service**, for somebody who is both Owner and Manager —
  the Step runs under whichever Role they hold first. The Service now carries `recordedByRole:
  manager` on the record itself, as a Sale and a Mortality already do.
- **The refusals a Manager will hit in the shed came back in English.** They are said in Bangla now.
- **"Breeding" is on the glossary's Avoid list for a Service**, and the Bangla used প্রজনন for it.
  It uses পাল দেওয়া now, which is the farm's own word for serving a cow.

## Decisions and departures

- **One way in, whichever way she was served.** "Recorded the same way", the decision says: an AI
  service is the Step of the work her Heat raised; a natural service is the Step of a round that
  walks the Pen. The record and its gate are the same either way.
- **The audit trail records the Role the Step ran under**, which for an Owner-and-Manager may read
  "owner" though the Service needed the Manager role. The gate checks the person's Roles, not the one
  the Step picked; recorded rather than changed, since it is how every Step records its Role.

## Not done, and why — and three questions for the Owner

- **A cow served twice in one heat cannot be recorded.** Serving at twelve hours and again at
  twenty-four is common AI practice. A Heat raises one piece of work and its Step records one
  Service. Whether this farm does it decides whether ticket 44 counts failed *heats* or failed
  *services* — two services in one heat must not count as two failures. **Asked.**
- **When she was served is when it was recorded.** `servedAt` is the phone's clock, the same as a
  Heat's `seenAt`, and a Correction keeps it — so a service written up the next morning carries the
  wrong day, and the Pregnancy Check and Expected Calving count from that day. There is no Evidence
  type for a date and time yet. **This becomes a real error in ticket 44**, where the day first
  counts.
- **A Manager can record a Service from a Shed Phone.** ADR 0003 keeps a Vet's clinical acts off
  shared phones and says nothing about parentage. **Asked.**
- **The visiting Vet's `C (own cases)` on the Service row** carries no qualifier in the matrix. The
  corrected ticket reads it as the Pregnancy Check and Abortion only. **Asked.**
- **Correcting a service to "not served" leaves the heat's work completed**, so nobody is sent to
  serve the cow who really was in heat. Reopening finished work is a change of its own.

- **Nothing falls due from a Service yet.** The Pregnancy Check forty-five days on is ticket 44's.
- **A failed service is not yet counted as failed.** A negative Pregnancy Check says so (ticket 44).

## Verification

`pnpm check-types` clean with colour stripped; `pnpm test` 415 passing (386 api + 19 web + 10 i18n),
up from 408 — an AI service finishing its work and naming its heat; a natural service by the farm's
bull; **a natural service no heat went before**; **a bull refused as the served animal**; **an AI
service refused without a technician**; a bull the farm does not have refused; the milker and the
Vet refused by the Step, and the Owner refused by the Service on work the Step lets them into
(mutation-checked); and a service procedure assigned to Barn Staff refused at publish. `pnpm build`
clean; `oxfmt` and `oxlint` clean on every changed file.
