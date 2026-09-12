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

**How it was built.** The shape is the one the Owner confirmed when the release was mapped: _"A's exception list on top, B's KPI tiles below. C rejected — problems split across cards were harder to scan than one list."_

- **An empty list is the answer, not an empty box.** When nothing needs them the screen says the farm is fine, in words, in the middle of where the list would be. A screen that always has something on it is a screen that stops meaning anything.
- **Nobody types a figure onto this screen, and nobody can.** What went to the tank today is the sum of the Milk Records that say Bulk — not the reconciled figure from a tank reading that may not have been taken yet, and not a number anybody entered. Milk sent to Discard is not in it: the tile is the farm's record of where the milk went, and there is a test that holds it to that.
- **The week is a window, not a row count.** Seven bars means the seven milkings behind today, so a farm that has not milked since Tuesday sees the gap — rather than a seventh bar reaching back a month and comparing today with a different season.
- **The rows that would be lies are absent.** Low stock waits for increment 6 and the DLS renewal for increment 7, and the screen says so in a line rather than showing a zero that is not true yet.

**A notification row the table owed.** _"SOP proposal | Owner | digest"_ — the Manager could propose a change to the Playbook since increment 1, and nothing told the Owner it was waiting. It is a notice now, in the digest, because a suggested change is not something to wake anybody for.

**The shared farm, a fifth time.** The test asserted this test's own hour-late milking would appear on a list bounded to the fifty longest-waiting — on a farm carrying a year of other tests' late work, it does not, and should not. What is asserted now is the list's shape: bounded, longest-waiting first. Same for the milk tile, where the farm-wide "last seven sessions" was crowded out by other files' clocks until the window was made explicit.

**Review outcomes folded in.** One of these was a bug I introduced by fixing the last review's finding too enthusiastically.

- **The screen showed the word "error" instead of the farm.** The previous ticket's review said a screen that cannot load should say so rather than saying "loading" for ever — so I checked for failure before checking for data, and a phone with no signal, holding a perfectly good cached copy, threw it away to show an error. Cached first, error only when there is nothing. The Manager's home had caught the same fix and the same bug.
- **The milk tile was a day pretending to be a week.** A Milking Session belongs to one Pen, so a farm with four pens milking twice raises eight a day — and "the newest seven sessions" was seven from this morning. Worse, today's figure was filtered out of that same truncated list, so the tank reading under-reported by whatever the limit cut off. A bar is one day of the farm's milk now, every Pen added together, which is what somebody means when they ask what yesterday came to.
- **"Approvals" was in the acceptance criteria and not in the code.** Money Events arrive with Finance in increment 6, but work whose Version names the Owner as its checker is waiting on them today, and was nowhere. It is a row now.
- **A row that only links is not a row with its action.** The Owner approves a proposal from the list, which is the one decision only they can make.
- **The escalated label was a sentence with its middle removed** — the placeholders rendered verbatim, so an Owner would have read "in has been late for {hours} hours". It is its own word now. And the reason an entry needs a decision was printing its raw enum rather than the farm's words for it.
- **Every screen asked the same questions its own way.** Late work, entries needing a decision, cows under Withdrawal and the day's work were written twice between the two home screens. They are asked in one place now, so redefining any of them cannot leave one screen telling a different story.
- Also: the discarded litres are on the tile beside what reached the tank, which is the other half of where the milk went; the bars carry what they mean for a screen reader; and the Owner's screen is in the Owner's navigation only — a Manager was being offered a link to a refusal.
