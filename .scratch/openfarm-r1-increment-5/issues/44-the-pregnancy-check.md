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

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 5, user story 68; [Breeding and reproduction](../../openfarm-release-1/issues/11-breeding-and-reproduction.md) (step 3).

- [x] A Service asks the date and time she was served, defaulting to now; it may not be in the future, and a Correction can change it
- [x] Two services in one heat are both recorded and are one attempt
- [x] The Pregnancy Check SOP falls due the decided number of days after a heat's first Service — once per attempt, not once per service — and it is the Vet's
- [x] A positive check sets Expected Calving from the service date and the gestation, both Farm Parameters; a heifer reaches Pregnant Heifer
- [x] A negative check clears nothing she has, returns her to heat watch, and records the service as failed
- [x] Nothing about a pregnancy is a typed date: Expected Calving is derived and re-derived, never entered here
- [x] Tests cover a service written up late carrying its real day, two services in one heat raising one check and counting as one attempt, the check falling due, a positive setting the date and the State, a negative counting the failure, and a milker being refused

## What was built

**Two services in one heat are one attempt.** An attempt begins with a cow's first service and takes
in any other within the same 48 hours a heat lasts — the rule that already says two sightings are one
heat, now shared by both. Told apart by time rather than by the Heat each answered, because a bull
running with the herd serves cows nobody saw in heat. The AI work carries a second service Step that
may be skipped with "once was enough": a service Step is the one whole-work Step besides a dose that
can be skipped, because the farm serves some cows twice and not others.

**The check falls due from the attempt, and it is raised the way a Heat's AI work is.** `service` is a
farm event now. The Pregnancy Check SOP hangs on it with no days of its own — like a Heat's AI window,
the days are the farm's (`pregnancyCheckAfterDays`, 45), and a Trigger naming a number is refused at
publish. The work is raised under the attempt's first service and the instant she was served, on the
farm's day forty-five days later. An attempt the Vet has already checked on a round raises nothing.

The farm's fortnight of looking back is now measured on when work falls due, not on when its cause
happened. It had to be: a check is due six weeks after the service, and the old rule would have
raised it only if somebody opened the app within a fortnight of the service. For every other
happening nothing changes — their work is never due before they happen, and they are still read only
from the last fortnight.

**Whether she is carrying is the Vet's alone.** The Owner and the Manager may step into any shift, so
the effect asks, as the Service does; publishing a check procedure assigned to anybody but the Vet is
refused. A Vet walking a Pen of served cows may record checks animal by animal, and each is of her
latest attempt.

**Nothing about the pregnancy is typed.** Her latest check decides: positive sets Expected Calving at
the attempt's first service plus the gestation (`gestationDays`, 283), and a Heifer becomes a Pregnant
Heifer; negative expects nothing. It is worked out again whenever a check or a service under it
changes. A day she was served, corrected, closes the check raised on the old day and the new day
raises its own. A service the Vet has checked cannot be taken back until the check is. Her page shows
the checks, when she is expected to calve, and how many attempts did not take.

**Seven tests** across two files: a service written up late carrying its real day, and put right
(ticket 44's first slice, in the Service tests); two services in one heat raising one check, due from
the first, and both kept; a positive setting Expected Calving and the State; a negative counted as one
failed attempt and taking nothing; a corrected service day moving the check; and the Manager, the
Owner and a milker refused. Mutation-checked: counting every service as an attempt, looking back by
the happening, removing the Vet gate, counting from the wrong service, and leaving the old day's check
open each turn a test red. The first of those survived at first — the second service fell on the
farm's next day, so its duplicate check was due a day after the list the test read — and the test now
looks after both would be due.

## Interpretations worth the Owner's eye

- **"A negative clears nothing she has"** is read as: a negative takes no State or date away from a
  heifer who had none. A Pregnant Heifer whose *latest* check is negative is a Heifer again — which is
  how a mistaken positive, corrected, is put back. A later loss of a confirmed pregnancy is the
  Abortion (ticket 47), not a second check.
- **A cow with no check keeps whatever she has**, so a heifer bought in carrying (ticket 45) is not
  undone by the absence of a check this farm never made.
- **The two Farm Parameters are bounded but not tested by changing them**: every test file shares one
  farm, and a gestation changed mid-run would move every other file's dates. The positive test's
  expected date is the default 283 days.
- **Correcting a checked service's day is effectively out of reach**: the Manager's correction window
  is 30 days and a check comes at 45. Expected Calving still re-derives if an Owner who is also the
  Manager does it.
