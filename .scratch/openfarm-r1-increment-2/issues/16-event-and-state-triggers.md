# 16 — Work that starts because something happened

**What to build:** An SOP whose Trigger is an event or an animal's State raises Instances the same way a scheduled one does. The Owner authors "three days after a Move", or "while an animal is under Withdrawal", and the work appears for the right Pen at the right time without anyone remembering it. In-flight Instances still finish on the Version they started on, and raising stays idempotent — the same event twice raises the work once.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 2, user story 26.

- [ ] An event Trigger raises an Instance when the event it names is recorded, honouring `offsetDays` for event-relative schedules
- [ ] A state Trigger raises an Instance while an animal is in the named State, and does not raise a second one while the first is open
- [ ] Raising is idempotent under replay: the sync path and a repeated app-open change nothing
- [ ] The authoring screen can express both kinds, and publish still refuses a Trigger that names something the farm does not have
- [ ] Tests drive an event and a State change through the clock and assert what appeared, for whom, and that a second pass raises nothing
