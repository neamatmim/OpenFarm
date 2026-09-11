# 25 — The Owner's home

**What to build:** The Owner opens the app to an exception list: Overdue work, things waiting for their approval, SOP proposals, Withdrawals ending, entries that Need Review. An empty list means the farm is fine, and that is the point of it. Below the list, the tiles they actually judge the farm by — today's litres against yesterday's, work done against work raised, the herd count.

**Blocked by:** 24

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 2, user story 94.

- [x] The exception list covers Overdue, approvals, proposals, Withdrawal ending and Needs Review, each reachable in one tap
- [x] An empty list says so in words rather than showing an empty box
- [x] KPI tiles below, each derived from records rather than typed anywhere
- [x] Rows for low stock and renewal due are left for increments 6 and 7 rather than faked now
- [x] Tests cover a farm with exceptions, a farm with none, and the tiles' arithmetic

**How it was built.** The shape is the one the Owner confirmed when the release was mapped: *"A's exception list on top, B's KPI tiles below. C rejected — problems split across cards were harder to scan than one list."*

- **An empty list is the answer, not an empty box.** When nothing needs them the screen says the farm is fine, in words, in the middle of where the list would be. A screen that always has something on it is a screen that stops meaning anything.
- **Nobody types a figure onto this screen, and nobody can.** What went to the tank today is the sum of the Milk Records that say Bulk — not the reconciled figure from a tank reading that may not have been taken yet, and not a number anybody entered. Milk sent to Discard is not in it: the tile is the farm's record of where the milk went, and there is a test that holds it to that.
- **The week is a window, not a row count.** Seven bars means the seven milkings behind today, so a farm that has not milked since Tuesday sees the gap — rather than a seventh bar reaching back a month and comparing today with a different season.
- **The rows that would be lies are absent.** Low stock waits for increment 6 and the DLS renewal for increment 7, and the screen says so in a line rather than showing a zero that is not true yet.

**A notification row the table owed.** *"SOP proposal | Owner | digest"* — the Manager could propose a change to the Playbook since increment 1, and nothing told the Owner it was waiting. It is a notice now, in the digest, because a suggested change is not something to wake anybody for.

**The shared farm, a fifth time.** The test asserted this test's own hour-late milking would appear on a list bounded to the fifty longest-waiting — on a farm carrying a year of other tests' late work, it does not, and should not. What is asserted now is the list's shape: bounded, longest-waiting first. Same for the milk tile, where the farm-wide "last seven sessions" was crowded out by other files' clocks until the window was made explicit.
