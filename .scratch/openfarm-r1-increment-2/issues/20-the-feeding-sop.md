# 20 — The feeding SOP end-to-end

**What to build:** A feeding Instance arrives already knowing what this Pen should get: each Feed Item with its target kg. Staff confirm what was actually given and anything left over from last time, and a normal day is two taps. A pen that is off its feed shows up the same day as a refusal rather than as a number nobody compared. Each feeding writes a Feeding record the farm keeps, and the Manager sees given-against-target per Pen.

**Blocked by:** 19

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 2, user story 73.

- [ ] The feeding Step is prefilled with the target per Feed Item and records given and leftover
- [ ] A Feeding Effect writes the record in the Completion's transaction, idempotent on it
- [ ] Given well under target is flagged on the Instance, on the farm's tolerance parameter, not a hard-coded one
- [ ] It all works offline through the Outbox, like every other entry
- [ ] Tests cover a normal feeding, a refusal, a replayed entry and a correction
