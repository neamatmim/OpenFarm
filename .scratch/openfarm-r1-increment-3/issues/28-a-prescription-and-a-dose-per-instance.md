# 28 — A Prescription, and a dose per Instance

**What to build:** The Vet prescribes for one animal — the product, the dose, the route, how often and for how long — and the farm turns that into work: one Treatment Instance per dose, on the schedule the Vet set. Staff give the dose and record it like any other Step, so a dose nobody gave is Overdue on the same screen as a milking nobody did. That is the whole point of prescribing in the system rather than on paper: the farm can see the course being followed.

**Blocked by:** 26, 27

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 3, user stories 50 and 51.

- [x] Only a Vet may prescribe, and only a product whose withdrawal days are known
- [x] A Prescription raises one Instance per dose at the times it calls for, and no more however often anything runs
- [x] Giving a dose is recorded on the Instance, by whoever gave it, and works offline like every other entry
- [x] A dose nobody gave goes Overdue with the rest of the day's work
- [x] Tests cover prescribing, the Instances it raises, a dose given, a dose missed, and a product that may not be prescribed

## How it was built

**An SOP already declares what raises it**, so the Treatment SOP declares that a Prescription does: a new Trigger kind `{ kind: "prescription" }` and a new Step Effect `treatment`. The farm therefore needs no second place recording which procedure this is — no marker column, no farm setting — and the Owner can reword the dose Step, add a glove or a withdrawal reminder to it, and it stays the same procedure. Nothing else raises that work: the scheduler skips a prescription trigger explicitly, so neither the clock nor anything that happens to an animal can raise a dose.

**The whole course is raised when the order is signed**, not by something running later, so it exists the moment the Vet writes it and nothing needs to be running for a dose to arrive on a phone in three days' time. Each dose Instance carries a cause naming the course and the dose number, so gathering the day's work again raises nothing. `raiseDueInstances` now returns the rows it created with their causes rather than a count — work already raised is quietly skipped, and a dose hung on the wrong Instance would be a dose given on the wrong day.

**The dose arithmetic counts forward from now.** A twice-daily course of three days written at noon starts tonight and runs to its sixth dose on the fourth morning. And when every one of the day's times has already gone by, the first dose is _now_: a Vet who orders a once-daily antibiotic at ten in the morning means the cow gets one today.

**A dose that was not given can say so.** The rule was that only a per-animal Step may be skipped; a dose Step is about one animal without repeating, so it is now also skippable — "the bottle was empty" is recordable rather than silent. A Correction back to a skip clears the dose, because a Withdrawal counted from a dose nobody gave would be a lie.

**Prescribing refuses** anybody but the Vet, a Vet on a shared Shed Phone, a product whose withdrawal days nobody has written, and a Diagnosis about another animal. The Owner and the Manager read courses (roles matrix); the Vet writes them.

Also: `contentOf` was privately duplicated in two modules and now lives once in `sop-content.ts`; `correctionWindows`/`refusalData`/`reasonInput` moved to `corrections.ts` in ticket 27's prefactor.

## Cut, and owed

- **A Vet cannot yet change or stop a course.** The roles matrix gives the Vet **U** on Prescription, and a cow who recovers on day two leaves every remaining dose to go Overdue in turn. This needs a decision that is the Owner's, not mine: a stopped dose is not _missed_ (nobody failed to do it) and the farm's Instance States have no word for "no longer owed". Adding one touches the day's work, the queues, the Alerts and sign-off, so it wants its own ticket rather than a corner of this one. **This is the one gap in this ticket that a real course of treatment will hit.**
- **No Treatment SOP is seeded.** Prescribing refuses until the Owner publishes a procedure whose trigger is a prescription; the refusal now says so, in Bangla, and the Playbook editor offers the trigger. The farm has no starter Playbook at all, so seeding one is a product decision rather than this ticket's business.
- **Two treatment procedures**: the oldest wins, deterministically. Refusing would block prescribing over a Playbook the Owner can put right in a minute.
- **A dose on an animal who has left the farm is refused** (`loadLiveAnimal`), same as a Diagnosis.

## Review outcomes folded in

Two-axis review of `ce156bf`.

- **Standards — `theTreatmentSop` would have crashed on a versionless Definition.** The schema allows `currentVersionId` to be null; `contentOf` is a bare cast, so `.triggers` on undefined would have thrown a TypeError and every `prescribe` would have 500'd instead of refusing. The neighbour filters first; now this does too, and a test writes such a Definition directly to prove it — publishing is the only way in through the API, which is the point.
- **Spec — nothing tied the trigger to the dose Step.** An Owner could publish a prescription-raised procedure whose Steps record no dose: six doses given, none recorded, and ticket 29's Withdrawal with no last dose to count from. Publishing now requires the pair both ways, with a message in the Owner's terms. Tested in both directions.
- **Spec — the Owner and the Manager could not read a course.** `forAnimal` was Vet-only against the matrix's **R** for both, and refused a read with a message about writing.
- **Spec — once-daily prescribed after its time started tomorrow**, so a cow ordered an antibiotic at ten in the morning got nothing that day. The first dose is now _now_. Tested.
- **Spec — the widened skip rule was creep.** Allowing a skip on every animal-scoped Instance changed behaviour for work from increments 1–2 that this ticket has no business touching. It is now the dose Step itself that may be skipped, which also removed a parameter threaded through two call sites.
- **Spec — doses stay with the cow when she moves**: already true, because ticket 17 walks open animal-scoped work with her. Now covered by a test rather than assumed.
- **Standards — "course" was standing in for Prescription** in `courseView`/`theCourse`/ `withCourses`. Renamed to the glossary's word.
- **Standards — the duplicated course line** on the Vet's screen and the animal's page is one `CourseLine` component, typed by `DoseRoute` from the domain instead of `string` with a `MessageKey` cast.
- **Standards — two doc comments were orphaned** by my insertions, leaving `applyObservationEffect` and `TriggerFields` undocumented. Put back.
- **Standards — the effect loaded every sibling dose** to say "3 of 6"; it reads the order's own arithmetic now.
- **Standards — `ofKind(kind: string)`** now takes `TriggerKind`.
- The `no_treatment_sop` refusal reaches the Vet in Bangla rather than as the server's English.

Not taken: `no-await-in-loop` in the new test file, which matches the pattern in five other test files.

## Honestly

`home.test.ts`'s farm-wide overdue assertion failed **once** during this ticket and passed in six later runs; I could not reproduce it and have not fixed it. It counts rows in a queue sliced to a limit, on a farm every test file writes to — the sixth time shared-farm state has produced a flake here. Worth a decision about the test harness rather than another patched assertion.
