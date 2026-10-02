# 03 — A Release put off is raised again

**What to build:** A bull's Release skipped, or closed Missed, while he is still in Quarantine is raised again after the
farm's days, and again after that, until he is out.

**Blocked by:** —

**Status:** open.

- [ ] **Glossary:** **Release** widened (put off — skipped or Missed — it is raised again after the farm's days while
      he is in Quarantine). **Trigger** untouched: this is the work raising its own successor, as a Prescription raises
      its doses.
- [ ] **Schema:** Farm Parameter `farm.put_off_days` (default 7, 1–60), **the Owner's or the Manager's**, wired as
      `feed_days_low` was (not on the Owner's-alone list). Migration `…_put_off_days`, both dev databases.
- [ ] **Rule:** `work-cause.ts` gains `putOffCauseOf(cause, n)` / `putOffOf(cause)` — `<original cause>:again:<n>` — so
      every raising is unique and the original is found from any of them.
- [ ] **Entry:** when a release-effect Step (`effect.kind === "release"`) is recorded skipped, or its Instance is
      closed Missed, and he is still in Quarantine, raise one Instance of the same Version for him in his Pen, due
      `put_off_days` farm days on, in the same transaction. A Correction of the skip to done calls that work off; a bull
      released any other way (02's door, 05) has his open put-off Release called off with the State change.
- [ ] **Screen:** the raised-again work shows on the board as any Release does, with "আবার / again" and the day it was
      first put off.
- [ ] **Tests:** `routers/release-again.test.ts` — skipped "Unwell — stays in quarantine": a second Release due seven
      days on, not before; skipped again: a third; Missed: raised again; the skip corrected to done: the again-work
      called off; released by hand: called off; the days are the Manager's to set. **Proved by switching off** the
      skip path, the Missed path and the call-off — each red.
- [ ] **Somebody opens it** (seed): skip a seed bull's Release on the board; it is back on the Manager's work seven days
      on (FakeClock in a test, or the board's day changed in the dev database).
