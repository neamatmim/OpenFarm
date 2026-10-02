# 01 — Quarantine pens, and Intake into one

**What to build:** The Owner or the Manager marks a Pen as a quarantine pen. An Intake — and any bought animal
registered in Quarantine — goes only into one; a farm with none is told to mark one first.

**Blocked by:** —

**Status:** open.

- [ ] **Glossary:** **Pen** widened (a Pen may be marked a quarantine pen by the Owner or the Manager; unmarked while
      it holds a bull in Quarantine, never); **Intake** widened (into a quarantine pen only). No separate "Quarantine
      Pen" entry: it is a Pen, marked.
- [ ] **Schema:** `pen.quarantine` boolean, default false. Migration `…_quarantine_pen`, both dev databases; the seed's
      "কোয়ারেন্টিন পেন" (`seed/standing.ts:91`) is marked, and the other seed farms' quarantine pens with it.
- [ ] **Entry:** `herd.markQuarantine({ penId, quarantine })` — Owner or Manager, audited; unmarking a pen holding an
      animal in Quarantine refused `pen_holds_quarantine`. `createPen` takes `quarantine` too. `herd.list` returns it.
- [ ] **Rule:** in `insertAnimal` (`herd-store.ts:271`), an animal entering in Quarantine needs a quarantine pen:
      `no_quarantine_pen` when the farm has none, else `not_a_quarantine_pen`. Words for both in
      `apps/web/src/lib/correction-refusal.ts`.
- [ ] **Screen:** Admin → Herd: a "কোয়ারেন্টিন পেন / Quarantine pen" switch on each Pen, and a mark beside its name.
      The intake sheet offers quarantine pens only (`admin/intake.tsx:75`), its hint now "He starts in Quarantine, in a
      quarantine pen"; with none, a notice "Mark a quarantine pen first" linking to Admin → Herd, and Record dim saying
      why. A `herd.list` answer cached without `quarantine` offers nothing and says so until it refreshes.
- [ ] **Tests:** `routers/quarantine-pens.test.ts` — no pen marked: Intake refused `no_quarantine_pen`; a dairy pen:
      `not_a_quarantine_pen`; a marked pen: taken; registering a bought animal in Quarantine the same; unmarking with a
      bull in it refused, empty allowed; Barn Staff may not mark. **Proved by switching off** each refusal — red. The
      69 test files that record an Intake mark their pen when they make it (`createPen({ …, quarantine: true })`);
      read Test Files, not Tests, for the whole run.
- [ ] **Somebody opens it** (seed): Admin → Herd shows the quarantine pen marked; the intake sheet offers only it;
      unmarked, the sheet says to mark one first.
