# 44 — The Pregnancy Check

**What to build:** Forty-five days after a Service the farm asks the Vet to check her. A positive check is the moment she is carrying: it sets her Expected Calving at the service date plus the gestation, and a heifer becomes a Pregnant Heifer. A negative check sends her back to heat watch and counts the service as failed — which is what the Repeat Breeder flag will later be counting.

Three Owner decisions from 2026-09-13, after ticket 43's review, each change this ticket:

- **The farm sometimes serves a cow twice in one heat** — AI at twelve hours and again at twenty-four.
  Every service is recorded, and they are **one attempt**: the Pregnancy Check falls due from the
  heat's first service, and a heat whose services did not take is one failure, not two — or she is
  a Repeat Breeder a whole cycle early.
- **A Service asks when she was served**, filled in with now and changed only when it is written up
  late. Every date in this ticket counts from that day, and a Correction can put a wrong day right.
- **A Service may be recorded from a Shed Phone.** Parentage is attributed to the Manager whichever
  phone it came through, and the trail says which device.

**Blocked by:** 43

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 5, user story 68; [Breeding and reproduction](../../openfarm-release-1/issues/11-breeding-and-reproduction.md) (step 3).

- [x] A Service asks the date and time she was served, defaulting to now; it may not be in the future, and a Correction can change it
- [x] Two services in one heat are both recorded and are one attempt
- [x] The Pregnancy Check SOP falls due the decided number of days after a heat's first Service — once per attempt, not once per service — and it is the Vet's
- [x] A positive check sets Expected Calving from the service date and the gestation, both Farm Parameters; a heifer reaches Pregnant Heifer
- [x] A negative check clears nothing she has, returns her to heat watch, and records the service as failed
- [x] Nothing about a pregnancy is a typed date: Expected Calving is derived and re-derived, never entered here
- [x] Tests cover a service written up late carrying its real day, two services in one heat raising one check and counting as one attempt, the check falling due, a positive setting the date and the State, a negative counting the failure, and a milker being refused

## What was built

**Two services in one heat are one Attempt.** An Attempt begins with a cow's first service and takes
in any other within the 48 hours a heat lasts — the rule that already says two sightings are one heat,
now shared by both. Told apart by time rather than by the Heat each answered, because a bull running
with the herd serves cows nobody saw in heat. The AI work carries a second service Step that may be
skipped with "once was enough". *Attempt* is a glossary entry now.

**The check falls due from her latest Attempt, raised the way a Heat's AI work is.** `service` is a
farm event. The check SOP hangs on it with no days of its own — the days are the farm's
(`pregnancyCheckAfterDays`, 45), and a Trigger naming a number is refused at publish. The work is
raised under the Attempt's first service and the instant she was served, on the farm's day
forty-five days later. Only her latest Attempt raises one: a cow served again has come back into heat,
so the check of the Attempt before is closed and that Attempt counts as failed.

The farm's fortnight of looking back is now measured on when work falls due, not when its cause
happened. It had to be: a check is due six weeks after its service. For every other happening nothing
changes — their work is never due before they happen, and they are still read only from the last
fortnight.

**A check is of the Attempt that raised it, and nothing else.** A check procedure must be raised by a
Service alone, assigned to the Vet, and not walked animal by animal — each refused at publish
otherwise. The effect refuses a check on work her latest Attempt did not raise. A Vet walking a Pen
cannot say which of a cow's heats a pregnancy dates from; the farm can.

**The Vet's alone.** The Owner and the Manager step into any shift, so the effect asks. And the Vet
can put their own finding right: a Pregnancy Check is part of the clinical record, which the Vet's
correction window covers. Before this, `correctStep` never said so, and a Vet could correct nothing
recorded through a Step.

**Nothing about the pregnancy is typed, and a positive stands.** Her latest *positive* check sets
Expected Calving at its Attempt's first service plus the gestation (`gestationDays`, 283), and makes a
Heifer a Pregnant Heifer. A negative takes nothing from her — losing a confirmed pregnancy is the
Abortion (ticket 47). The one thing that undoes a positive is that positive being put right, corrected
to negative or taken back. A corrected service day closes the check raised on the old day, and the new
day raises its own. A service the Vet has checked cannot be taken back until the check is. Her page
shows the checks, when she is expected to calve, and how many Attempts did not take.

## What the review changed

The spec axis found the rules were wrong in three places:

- **A later negative wiped a confirmed pregnancy.** Her *latest* check decided, so a Pregnant Heifer
  served again by mistake and checked negative became a Heifer with no calving expected. That is an
  Abortion's to do. A positive now stands until it is itself put right.
- **A cow served again before her check came kept the old check**, recorded against the old Attempt.
  A positive would have dated her calving three weeks early, and the return to heat was never counted
  as a failure. Only her latest Attempt raises a check now, the one before closes, and it counts
  failed.
- **A check on a Pen round too early cancelled the real one** — and the standards axis found the same
  path left the raised work open to go overdue. Pen-round checks are gone. A check is recorded only on
  the work its Attempt raised.
- **"Two services, one failure" was untested.** Now a heat served twice across the farm's midnight
  and found empty counts one failure. The same test serves her from the Shed Phone and reads the
  device off the trail, which the Owner's decision named and nothing had shown.

The standards axis:

- **A taken-back positive left her pregnant.** Re-deriving from no checks left everything as it was.
  The caller now says when a positive is being undone.
- **Three orphaned doc comments.** One in the work page, left by this ticket's own lint fix. One in
  the SOP editor, already orphaned on main, where a new constant landed under it. And a stale comment
  in the slot builder.
- **Copy counted the wrong thing.** "Services that did not take" now reads "heats served that did not
  take".
- **Smaller:** the gestation re-derivation is written once; `recentHappenings` takes the same
  breeding times as the slot builder; the editor slices by the Service shape's own length; the page
  uses the domain's result type.
- **Also found:** the full run broke another file's test. My second heat raised work on the same farm
  day that the Owner-home test asserts is empty. This file's dates moved to 2030, a year no other test
  uses.

**Nine tests** in the check file, plus the Service tests' late-and-corrected day. Mutation checks that
go red: letting the latest check decide; never undoing a positive; letting a superseded Attempt's
work stand; not counting a superseded Attempt as failed; leaving the Vet's window off; dropping the
trigger rule; and the first round's four. **One survives:** raising a check for every Attempt rather
than only the latest. The service effect already closes the earlier Attempt's work, and in every order
the tests can reach, a sweep runs before the later service. It guards a phone that syncs two heats'
services with no sweep between them.

## Left open

- **Closing work as missed writes no event of its own.** Work closed because its service moved, or
  because she came back into heat, is marked *missed* inside the Correction's or the Service's own
  event — the same way ticket 42 closes a withdrawn Heat's AI work. Missed-work lists will include
  checks nobody missed. A distinct closing state is an Owner question worth asking before reports read
  missed work (increment 8).
- **The visiting vet is not told apart.** The matrix gives the visiting vet "C (own cases)", but the
  farm has one `vet` Role today and nothing scopes a vet to their own cases anywhere yet.
- **"Returns her to heat watch" is nothing the code does.** A heifer found empty is still a Heifer,
  and heat watch covers every Heifer, so there is nothing to undo.
- **The two Farm Parameters are bounded but not tested by changing them.** Every test file shares one
  farm, and a gestation changed mid-run would move every other file's dates.
- **Correcting a checked service's day is effectively out of reach.** The Manager's window is 30 days
  and a check comes at 45. Expected Calving still re-derives if an Owner who is also the Manager does
  it.
- **The check tests run in order.** Later ones build on the cows earlier ones served, as the Heat and
  Service tests do.
