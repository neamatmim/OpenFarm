# 20 — The feeding SOP end-to-end

**What to build:** A feeding Instance arrives already knowing what this Pen should get: each Feed Item with its target kg. Staff confirm what was actually given and anything left over from last time, and a normal day is two taps. A pen that is off its feed shows up the same day as a refusal rather than as a number nobody compared. Each feeding writes a Feeding record the farm keeps, and the Manager sees given-against-target per Pen.

**Blocked by:** 19

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 2, user story 73.

- [x] The feeding Step is prefilled with the target per Feed Item and records given and leftover
- [x] A Feeding Effect writes the record in the Completion's transaction, idempotent on it
- [x] Given well under target is flagged on the Instance, on the farm's tolerance parameter, not a hard-coded one
- [x] How often a Pen is fed is stated once, not twice: the feeding SOP's schedule and the Ration's own figure cannot be allowed to disagree, because a Ration that says twice a day beside an SOP raised three times feeds every bucket at two thirds and the working still reads "÷ 2 a day"
- [x] The work is fed on the Ration Version in force when it was raised, and the Feeding pins that Version by id — see "raised, not due" below
- [x] It all works offline through the Outbox, like every other entry
- [x] Tests cover a normal feeding, a refusal, a replayed entry and a correction

**How it was built.**

- **"How often" is stated once.** The Ration is the recipe — kilos per animal per day — and the schedule of the SOP that feeds is the only answer to how often. There is nothing left to disagree with. The cost is a real dependency: a Feeding Target exists only once something in the Playbook feeds, and a farm that has not authored one is told so rather than shown a figure derived from a guess.
- **Raised, not due.** The Ration is read as of the moment the work was *raised*, not the moment it falls due. Reading it at the due time left a gap on any Instance due later than it was raised: a Ration published in between would change what the morning's round was asked for, after the board had already said something else. Raised is a moment in the past that nothing moves.
- **The Feeding pins the Version by id.** The record carries `rationVersionId`, the animals and the sessions, so the arithmetic can be shown a year later on a farm that has changed. The ticket asked for the pin on the Instance; it is on the record instead, because a feeding-only column on the table every SOP shares would be the wrong home for it, and the preview the board shows is now deterministic anyway.
- **The shortfall is per Feed Item, not a total.** A Feed Item carries its own unit — straw in bales, molasses in litres — and a total that adds bales to litres means nothing. It is also the better answer: a Pen that got its silage and none of its concentrate has a problem that an average would hide.
- **Leftover counts against what was eaten.** The trough is the measure of the meal.

**Review outcomes folded in.**

- **The wrong schedule could divide the ration.** A farm with two feeding routines — a twice-daily round and a night top-up — divided both by whichever SOP was written first, so every bucket of the second was the wrong size while its working read as correct. The figure now comes from the Version that raised the work. There is a test with two routines on one Pen.
- **A Pen off its Ration could not record anything at all**, and the entry died permanently instead of landing: a phone that recorded in good faith had its morning refused. It is a late entry now, kept and put in front of a person (ADR 0002).
- **A cleared box read as "nothing given"**, putting a 100% shortfall and a flag on a Pen because somebody went to retype a figure. An untouched box means the figure it was handed.
- **A phone that had never seen the Pen's Ration would have recorded zeros against a target it did not know.** It says so and refuses instead — the one thing worse than not recording a meal is recording a false shortfall against it.
- **The flag was written and shown nowhere.** It is on the board where the work is. The Manager's own queue is ticket 24.
- **The tolerance was not a farm parameter in practice** — it was read from the farm but could not be set. It can be set.
- **A Correction cannot turn a Pen's feeding into a skip**, because a whole-Pen Step has never been skippable; a meal that did not happen is the Manager closing the work as Missed. The effect guards against it anyway, because a Feeding left standing beside a skip is a meal the farm believes it served, and increment 6 draws Stock from these.
- Formatting and lint: `vp lint` does not run the same rules as the repo's own `oxlint`, which had things to say about this branch — an await in a loop, two type aliases, and a component that had grown past the complexity limit. All fixed; the second is worth knowing about for every ticket after this one.

**A flake that was not this ticket's, found by it.** `people.test.ts` asserted the order of two Audit Events from a query with no `orderBy`, so the database was free to answer either way — and did, about one run in three. Every other test asking the same question already ordered by `receivedAt` and `id`. Now so does that one.
