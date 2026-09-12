# 16 — Work that starts because something happened

**What to build:** An SOP whose Trigger is an event or an animal's State raises Instances the same way a scheduled one does. The Owner authors "three days after a Move", or "while an animal is under Withdrawal", and the work appears for the right Pen at the right time without anyone remembering it. In-flight Instances still finish on the Version they started on, and raising stays idempotent — the same event twice raises the work once.

**Blocked by:** None — can start immediately.

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 2, user story 26.

- [x] An event Trigger raises an Instance when the event it names is recorded, honouring `offsetDays` for event-relative schedules
- [x] A state Trigger raises an Instance when an animal reaches the named State — see "while, or when" below — and does not raise a second one for the same occasion
- [x] Raising is idempotent under replay: the sync path and a repeated app-open change nothing
- [x] The authoring screen can express both kinds, and publish still refuses a Trigger that names something the farm does not have
- [x] Tests drive an event and a State change through the clock and assert what appeared, for whom, and that a second pass raises nothing

**How it was built.** Both kinds raise work through the same app-open sweep the clock already used, rather than through anything that runs on a timer. The farm looks back a fortnight over what has happened, and what raised a piece of work is written on the work itself as its **cause** — the Move row, the arrival, the State with the instant she reached it. A partial unique index on the cause is what makes opening the app twice raise it once; scheduled work keeps its own index on the due time, because two animals moved out of the same Pen in the same minute are two pieces of work and not one.

Decisions worth remembering:

- **An animal now records when she reached her State.** Without it, a cow who dries off this November and again next November is indistinguishable from one who never left, so the second dry-off check could never be raised. It is the anchor the days are counted from, too.
- **Days later means that day.** "Three days after she was moved" is a day's work, not an appointment for twenty to midnight because that is when somebody happened to move her. With no days, the work is due at the moment itself: an arrival check is for the person still standing there.
- **Work about one animal is about her.** The Instance names her, the pen board shows her alone, and completing it does not wait for every other animal in that Pen. It also **follows her**: move her again before the check comes due and the work moves too, because otherwise the Staff assigned to where she is would never see it and the ones assigned to where she was would be sent to fetch a cow who is not there.
- **Registering is not moving.** The herd register writes an arrival as a Move from nowhere, which is its business and not a Move anybody made. Arrival is its own happening, so a post-move check never fires on a cow who has only ever arrived. The full suite found this, not the tests written for it.

**While, or when.** The ticket said a State Trigger raises work _while_ an animal is in a State. It raises it **when she reaches** it, once per occasion. Recurring work for everything in a State already has a way to be authored — a schedule with `appliesTo`, which raises one Instance per Pen holding such an animal, every day, and has done since increment 1. Two mechanisms for one thing would be the thing to avoid, so the ticket's wording has been corrected rather than the code.

**What was cut, and why.**

- **"N days _before_" an event** is in the release spec's list of Trigger kinds and is not here. Counting backwards needs a date in the future to count back from — an Expected Calving, a Target Window — and the farm has neither until increments 4 and 5. A negative offset is refused rather than silently accepted.
- **"Under Withdrawal" cannot be authored**, although this ticket used it as an example. Withdrawal is a date on the animal, not one of her States, and the mechanism it wants is the health model in increment 3.
- **Arrival** is a third event kind the ticket did not ask for. It is here because a cow arriving is the commonest thing a farm wants a check after, and without it the Owner would have had to fake one with a Move.

**Known limitation.** A State change that is superseded before anybody opens the app is not raised: the sweep reads the State an animal is in now, not a history of the States she has been through. Two deliberate State changes with no app-open between them is the case, and the trail still records both. A State-change history is what would fix it properly, and breeding (increment 5) is the first increment that actually needs one.

**Review outcomes folded in.** The reviews found one bug that would have reached the farm and several that would have reached it later:

- **Publishing brought a backlog.** The guard was the Definition's creation date, but a Definition is created once and published many times: adding an event Trigger to an SOP the farm had run since June would have raised a fortnight of already-overdue work, with Alerts, under a Version that had not carried that Trigger (ADR 0001). It is the Version's publication instant now.
- **Exit States were publishable Triggers.** Sold, Died and Culled are States, so `{kind: "state", state: "sold"}` passed validation — and then raised nothing, ever, because work is only raised about animals on the farm. Publish refuses them and the authoring screen no longer offers them.
- **An Instance kept the Pen it was raised in**, which goes stale the moment she is moved again — see "follows her" above.
- Also: the happening is typed as a Side and a State rather than two strings, which removed the casts that hid the problem; the offset cap the Owner would otherwise have met at publish is on the field; and the Playbook editor's own type is no longer called the same thing as the store's.

**A test phone per test file.** Proving the sync path raises work once needed a batch, and a batch needed a sequence number — which belongs to the phone that sent it. Every test file shared one Shed Phone and one Staff member, so this file's batch took a number out of the sync suite's queue and its gap-reporting tests then had a hole where their own entries should have been. It failed on one run in two, which is the kind of test nobody trusts and everybody reruns. A file can enrol a phone of its own now, and the queues stay separate — the same lesson as the shared farm that made the suite run one file at a time in increment 1.
