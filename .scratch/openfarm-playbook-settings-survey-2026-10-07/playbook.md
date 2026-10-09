# Survey of the Playbook's lifecycle, 2026-10-07

Against main at 87b49dfe.

How procedures are written, published, versioned, proposed, retired and brought back, and how a change reaches work already raised. Each finding is marked **Proven** (a temporary test in `packages/api/src` went red, and was then deleted) or **Traced** (followed line by line).

What holds up: a piece of work pins its Version, and every Step answer, Effect, Correction and finish reads that pinned Version. The publish checks are thorough. A retired procedure cannot be published, proposed or approved into. Training is append-only.

The headline defects:

- **A new Version published during the day drops the rest of the day's work** when its times are unchanged. A typo fixed at ten loses the afternoon milking in every Pen. A phone that did that milking offline is refused, and the farm cannot take the milking in. (P1, high)
- **Retiring the procedure a prescription or a notifiable diagnosis raises** calls off every dose the Vet prescribed, and every report still owed to DLS. Nothing raises them again. The farm's own refusal tells the Owner to do exactly this ("retire that one first"). (P2, high)
- **Approving a Manager's proposal drafted against an older Version** silently undoes whatever the Owner published in between. (P5, medium)
- **A Move, arrival or sighting held on a phone** that reaches the farm after a new Version of its procedure raises no work under either Version. (P4, medium)

---

## Findings

### P1. A same-time Version published mid-day loses the rest of the day's scheduled work

**Proven, high.**

**What happens.**

1. The day's scheduled work is raised at the first turn of the day, for every time in the day, including those still to come.
2. Publishing Version 2 calls off the old Version's unstarted scheduled work due from now on. That is meant to let the new Version raise the work at its own times.
3. The called-off row keeps its place in the unique index `(definition, pen, due time)`.
4. When the new Version keeps a time — say it only changes wording or grace — its slot collides with the called-off row. `raiseDueInstances` skips it (`onConflictDoNothing`).
5. So the work is not on anybody's list for the rest of that day.

The test: milking at 05:00 and 16:00, raised at 09:00, Version 2 at 10:00 changing only the grace, turned again at 10:30. Only the 05:00 work stood. The 16:00 work was called off and never raised again.

A second test went further. A phone that held the 16:00 Step offline sent it later, and it was refused: "This work is called off". Needs Review can take in work closed as Missed, but not work Called Off. So the afternoon's litres can never be recorded against the work.

The rounds survey's moved-times fix (`schedule-days.test.ts`) only tests times that change, which is why this got through.

**Why it matters.** Any edit published during the day — fixing a word, changing the grace, approving a proposal — silently removes the rest of the day's milking, feeding or head count, in every Pen. Nothing goes overdue, so nobody is told. Milk records for that session cannot be written.

**What should happen.** A slot the new Version keeps should be raised under the new Version, or carried across to it, never lost. Possible fixes:

- Raise again (`raiseAgain`) the called-off row for any slot the new Version still has.
- Or leave unchanged slots alone and call off only the times the new Version dropped.

**Where.**

- `packages/api/src/routers/sops.ts:294-307` (the call-off on publish)
- `packages/db/src/schema/instance.ts:79-81` (the unique index the called-off row still holds)
- `packages/api/src/instances-store.ts:772` (`onConflictDoNothing`)
- `packages/api/src/entries/step-completion.ts:312` (only Missed work may be taken in)

### P2. Retiring the treatment or report procedure calls off prescribed doses and owed DLS reports

**Proven, high.**

**What happens.** `retire` calls off every unstarted piece of work of the procedure, whatever raised it. For the procedure a prescription raises, that is every dose still to come of every course on the farm. For the procedure a notifiable diagnosis raises, it is every report not yet delivered.

Nothing raises them again:

- Restoring keeps called-off work called off.
- A replacement procedure is not asked about courses or Diagnoses that already exist. Prescriptions and Diagnoses raise their work only when they are written.

What the tests saw:

- **The dose test:** a three-day course, then the Owner retired the treatment procedure. All three doses were `called_off`. The course was not stopped, so `stoppedAt` was null and the Vet was not told. `tellItsDoers` tells only the procedure's assigned Role.
- **The report test:** an anthrax Diagnosis, then the Owner retired the report procedure and published a new one. The `dls_report` row is still undelivered, and its only work is `called_off`. Nothing else in the app lists an undelivered report.

The farm's own refusal sends the Owner this way. Writing a second treatment or report procedure is refused with "retire that one first".

**Why it matters.**

- A course of antibiotics stops part-way, and nobody decided it. Stopping a course is the Vet's act.
- A legal report to the Upazila Livestock Office drops off every list.

**What should happen.** Retiring should never call off work an act raised (a cause of `prescription:` or `notifiable:`). That work should finish on the Version it pinned, as work somebody has started does. If the Owner chooses to move it instead, a replacement procedure should take over the doses and reports still owed. The refusal message should stop telling the Owner to retire first, or should say what that does to work already owed.

**Where.**

- `packages/api/src/routers/sops.ts:864-872` (retire calls off everything unstarted)
- `packages/api/src/routers/sops.ts:94-107` ("retire that one first")
- `packages/api/src/routers/prescriptions.ts` (`raiseCourse`, raised only when prescribed)
- `packages/api/src/health-store.ts` (`raiseTheReport`, raised only when diagnosed)

### P3. Retired and brought back on the same day, a procedure loses that day's later work

**Proven, medium.**

**What happens.** This is the same cause as P1. The test:

1. A 16:00 procedure is raised at 09:00.
2. It is retired at 09:30, which calls the 16:00 work off.
3. It is restored at 10:00.
4. At 10:30 nothing stands for 16:00. The called-off row holds the slot.

**Why it matters.** The glossary says bringing a procedure back "raises its work afresh from the next time it is due". Here the next time it is due is lost. An Owner who retires by mistake and undoes it at once loses the rest of the day's work.

**What should happen.** On restore, slots still to come today should be raised again under the procedure's Version. The fix for P1 should cover this as well.

**Where.**

- `packages/api/src/routers/sops.ts:864-872` and `891-937`
- `packages/db/src/schema/instance.ts:79-81`

### P4. A happening recorded before a new Version, reaching the farm after it, raises no work at all

**Proven, medium.**

**What happens.** Work hung on an event or a State is raised only by the day's turn. The turn runs every five minutes, and whenever somebody opens the app. A later Version raises nothing for what happened before it was published, and the Version before it is no longer read.

The test, with a post-move check one day after a Move:

1. A Move was made on a phone out of signal at 09:00.
2. Version 2 changed only the grace, at 10:00.
3. The Move reached the farm at 11:00.
4. No check was raised.

A control test without Version 2 raised the check.

**Why it matters.** Any Outbox entry that raises work can lose it this way: a Move, a sighting (a Heat raises the AI work, and missing one costs three weeks), or a death. It also happens online, within the five minutes before a turn. The farm never shows that the work was owed.

**What should happen.** A trigger that was already in force under the earlier Version should still raise work for things that happened while it was. For example, count "in force since" from the earliest consecutive Version carrying an equal trigger, not from the latest publish.

**Where.**

- `packages/api/src/instances-store.ts:397-402` (`inForce`)
- `packages/api/src/the-day-turns.ts:243-256` (`triggersInForceSince`, `catchesUp`)

### P5. Approving a proposal drafted against an older Version undoes the Owner's later change

**Proven, medium.**

**What happens.**

1. A proposal stores `basedOnVersionId`, but nothing reads it.
2. The proposal's whole content is published as the next Version.
3. The test: the Manager proposed a new grace against Version 1. The Owner then published Version 2 with a reworded Step. The Owner approved the proposal, and Version 3 said the old wording again.

The Proposals tab shows only the Version in force. It never says "drafted against Version 1".

**Why it matters.** The Owner's own correction disappears with one click on Approve, and nothing warns them. The trail shows Version 3 as "approved", not as "reverted".

**What should happen.** When the procedure has moved on since the proposal was drafted, the farm should do one of these:

- Refuse the approval, so the Manager drafts again.
- Show what changed since, and ask the Owner to confirm.

**Where.**

- `packages/api/src/routers/sops.ts:691` (stored)
- `packages/api/src/routers/sops.ts:721-777` (approve, which never compares)
- `apps/web/src/components/playbook/proposals-tab.tsx:54-66`

### P6. Whole-farm work is not called off by a new Version, so a moved time raises it twice

**Proven, medium.**

**What happens.** Publishing calls off only scheduled work whose cause is null. Whole-farm scheduled work carries a cause (`whole-farm:<time>`), so it is never called off.

The test: a whole-farm job at 16:00 was raised at 09:00, then moved to 16:30 by Version 2 at 10:00. Both the 16:00 and the 16:30 work stood that day. When the time is unchanged, the old Version's work stays on the old Version. That is the opposite of what Pen work does.

**Why it matters.** The cash count, the stock count, the medicine count and the biosecurity check are whole-farm work. Two counts in a day means two answers. The unanswered one goes overdue and is escalated to the Owner.

**What should happen.** Whole-farm scheduled work should be treated as Pen work is, through the same fix as P1.

**Where.**

- `packages/api/src/routers/sops.ts:294-307` (`isNull(sopInstance.cause)`)
- `packages/api/src/instances-store.ts:231`

### P7. Raising the report procedure by hand makes work that can never be finished

**Proven, low-medium.**

**What happens.** `mayRaiseByHand` refuses only a procedure a prescription raises. The Playbook and Today screens offer "raise it now" on the DLS report procedure. The work is raised in a Pen with a `byHand:` cause and no `dls_report` row, so its only Step is refused: "This work is not the report of any diagnosis".

The same reasoning applies to the Registration renewal, and to whole-farm work, which is raised by hand into a Pen.

**Why it matters.** It is work nobody can finish. It goes overdue and has to be closed as Missed.

**What should happen.** `mayRaiseByHand` should also refuse `notifiable_disease`, and probably `registration_renewal`. Whole-farm work raised by hand should be raised in no Pen.

**Where.**

- `packages/domain/src/sop.ts:813-816`
- `packages/api/src/routers/work.ts:196-259`

### P8. Publishing accepts two Steps with the same id, and the second is never asked

**Proven, low.**

**What happens.**

1. `findStructuralProblems` does not check that Step ids are unique.
2. `stepOf` finds the first Step with that id.
3. `finish` counts a completion under that id for both Steps.

The test: a tick Step and a litres Step, both with the id `look`. Ticking the first finished the work. The litres were never asked for.

The editor's `freshStepId` avoids this, so only the API, or a hand-made proposal, can do it.

**Why it matters.** A Version can say something the farm cannot do, and the farm does not say so.

**What should happen.** Refuse duplicate Step ids at publish. Duplicate choice values within one Evidence should be refused too.

**Where.**

- `packages/domain/src/sop.ts:1039`
- `packages/api/src/completion-store.ts:20-28`
- `packages/api/src/entries/finish.ts:56-69`

### P9. A first Version published mid-morning raises the morning's work already overdue

**Proven, low.**

**What happens.** A first Version published at 10:00 with times 05:00 and 16:00 raised today's 05:00 work in each Pen, already past its grace. The check `lateBeforeItsVersion` applies only when `catchesUp === false`. Its own comment says the first Version's catch-up "raises nothing already overdue".

**Why it matters.** Adopting a procedure puts overdue work on the Manager's list at once. Nobody was asked to do it in time.

**What should happen.** Skip a slot already late when the first Version came into force, as later Versions do. Or, if the Owner wants it raised, fix the comment.

**Where.** `packages/api/src/instances-store.ts:210-219`

### P10. The same procedure can be adopted twice

**Proven, low.**

**What happens.** `sops.create` has no name check. The standard head count was created twice, and both copies were accepted. The Standard Playbook card hides a standard procedure only when one with its exact Bangla name exists. So a copy the Owner has renamed brings the standard one back on offer. Adopting it gives two procedures raising the same work.

**Why it matters.** Every Pen gets two head counts, two milkings, and so on.

**What should happen.** Refuse a second live procedure with the same name, in either language, under the farm's name-clash rule (`names.ts`). Possibly also remember which standard procedure a Definition was adopted from.

**Where.**

- `packages/api/src/routers/sops.ts` (`create`)
- `apps/web/src/components/playbook/standard-sops.tsx:112-122`

### P11. Two publishes at once end in a database error

**Proven, low.**

**What happens.** The next Version's number is read and then inserted with no lock. Two publishes at once — two of the Owner's devices, or Approve beside Publish — collide on `sop_version_number_uidx`. One of them gets a raw `duplicate key` error, which reaches the screen as a server error.

**Why it matters.** It is rare. The Owner would see "something went wrong" rather than "this procedure changed while you were editing it".

**What should happen.** Lock the Definition row before counting, or turn the unique violation into a `CONFLICT` with a refusal.

**Where.** `packages/api/src/routers/sops.ts:266-283`

### P12. Nobody is shown who still needs teaching the Version in force

**Traced, low.**

**What happens.** Training is correctly append-only. But the card's "Trained on" list mixes every Version's rows, labelled only with a number, and the person page does the same. Nothing says "taught Version 2; Version 4 is in force".

`training` with `asOf` cuts the list at a date. Its comment promises to say "which Version was in force by then", but it does not.

**Why it matters.** After a change, the Manager cannot see who still needs teaching it. "Did they know this procedure on the day" has to be worked out by hand.

**What should happen.** Mark each person's latest training as current or earlier, against the Version in force on the day asked about.

**Where.**

- `packages/api/src/routers/sops.ts:519-545`
- `apps/web/src/routes/_authenticated/sops/$definitionId/card.tsx:253-350`

### P13. The Manager is never told what became of their proposal

**Traced, low.**

**What happens.** `approve` and `reject` tell nobody. A rejection's note is required, but the only place it is kept is the audit trail. `proposals.list` shows only pending proposals. When the Owner retires a procedure, the proposals waiting on it simply vanish from the list.

**Why it matters.** The Manager has no way to learn why a suggestion was turned down. The Owner's reason never reaches them.

**What should happen.** Tell the proposer of the decision, with its note. Optionally, list recent decisions in the Proposals tab.

**Where.**

- `packages/api/src/routers/sops.ts:721-826`
- `packages/api/src/notice.ts:88-94`

---

### Owner choices

1. **When the Owner publishes a change during the day, should the rest of today's work follow the new Version, or finish on the old one?** Recommended: follow the new Version. Raise the remaining slots under it, and never leave a slot with no work (P1, P3, P6).
2. **When the procedure a prescription or a diagnosis raises is retired or replaced, what becomes of doses and reports already owed?** Recommended: they stay owed. Retiring never calls them off, and they finish on the Version they were raised under. Only the Vet stops a course (P2).
3. **Should approving a proposal drafted against an older Version be refused, or shown with what changed since?** Recommended: refuse it, and ask the Manager to draft again against the Version in force. It is simple, and nothing is lost unseen (P5).
4. **Should a happening that the previous Version would have raised work for still raise it, when it reaches the farm after a new Version?** Recommended: yes, whenever the trigger was in force under both Versions (P4).
5. **Should a first Version published mid-morning raise that morning's already-late work?** Recommended: no, as the code comment says (P9).
6. **Should two live procedures with the same name be refused?** Recommended: yes, under the farm's existing name-clash rule (P10).
7. **Should the card show who was taught an earlier Version, and should staff be asked to be retaught after a change?** Recommended: show it; do not block work on it (P12).

### Checked and holding

- **Work pins its Version.** Step answers, Evidence, Effects, finish and Corrections all read the pinned Version. A Version published later does not change open work (`work.test.ts`). A phone's held answers to open old-Version work are taken on that Version.
- **Versions are immutable** and numbered per Definition. Any Version can be read by its number, and the card names its Version and date.
- **Publish checks:**
  - Bangla on every string.
  - Steps, Evidence and ranges.
  - Step Shapes, and Effect-and-trigger pairs.
  - One dose, report or Lot Number each.
  - Role rules.
  - Whole-farm rules.
  - Events checked against `FARM_EVENTS` and States against live States.
  - Offsets bounded, and none on a Heat or a Service.
  - A campaign's product must have withdrawal days.
  - Only one prescription procedure and one report procedure.
  - A product retired after publishing is handled at dose time.
- **A retired procedure** is refused for publish, propose and approve (`sop-retire.test.ts`). It raises nothing on the clock, by a happening, or by hand. Its proposals are hidden and its card stays readable.
- **Bringing a procedure back** is refused while another prescription or report procedure is in force. It raises nothing for what happened while it was retired, and the missed-day catch-up respects `restoredAt`.
- **Schedules** run on the farm's day: `dueAtFor` and `scheduleFallsOn` use the farm zone. Every other week is anchored to a fixed Sunday. Duplicate times fold into one through the unique index. Moved times are handled (`schedule-days.test.ts`).
- **Training** is append-only and recorded once per Version per person (unique index). It is refused for somebody disabled or with no Role, and a race between two Managers marking at once is handled.
- **Proposals**: only the Owner or a Manager may propose, and only the Owner decides. A decision cannot be made twice (guarded update), and approving a proposal on a retired procedure is refused.
- **The Standard Playbook**: every standard procedure publishes once its Pen or product is named (domain test). A Step that walks a cow takes its Pen from the farm's own list. `CREW` in the seed covers what the seed keeps, by design.
- **A prescription's work** cannot be raised by hand, and each dose is raised once, by its cause.
