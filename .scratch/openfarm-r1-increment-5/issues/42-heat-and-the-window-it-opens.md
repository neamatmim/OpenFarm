# 42 — Heat, and the window it opens

**What to build:** Somebody on the heat-watch round sees a cow bulling and records it. That is a Heat, and it starts the clock: the farm raises the AI work for her, due between twelve and eighteen hours later, because that is the window in which a service takes. The window is a Farm Parameter, not a rule hidden in the code.

**Blocked by:** None — can start immediately.

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 5, user story 66; [Breeding and reproduction](../../openfarm-release-1/issues/11-breeding-and-reproduction.md) (step 1); `CONTEXT.md` — **Heat**, **Observation**.

- [x] A Heat is an Observation of oestrus, recorded by the Step that saw it, and the glossary's existing words are used rather than new ones
- [x] Recording one raises the AI work for that cow, due at the start of the window and overdue at the end of it
- [x] The window is a Farm Parameter with the decided defaults (12 h and 18 h), Manager-editable
- [x] A second Heat for a cow whose AI work is already open does not raise a second piece of work
- [x] Her page shows her Heats, and the work each one raised
- [x] Tests cover a Heat raising the work, the window's two ends, a repeat Heat raising nothing, and Barn Staff being able to record one in their own pens

## What was built

**A Heat is an Observation whose word is `heat`.** No new table and no new effect kind: the
glossary already said "an Observation of oestrus is what a Heat is recorded as", and the
Observation's `saw` column was built in increment 2 to be the stable word Breeding would match on.
A fixed word rather than a meaning attached to a choice, because the Version's choices are the
author's to reword, and the farm has to tell a Heat from "off her feed" in a record three seasons
old.

`heat` joins the farm events, so a procedure can be raised by one. Its work is timed by the
**AI Window** — a new pair of Farm Parameters, twelve and eighteen hours by default — rather than
by a whole number of days: due at the window's start, late at its end. A window that closes before
it opens is refused, because it would make every AI job late the moment it was raised.

A Heat seen twice is one heat. Which sightings *begin* a heat is decided from the sightings
themselves — a sighting within 48 hours of the one that began her heat is the same heat — and only
those raise work.

A heat Observation that a Correction withdrew raises nothing: work raised on it would send somebody
to serve a cow who was not bulling.

## What the review changed

Both axes found the same bug independently, and the spec axis found more — including in the one
case I had asked it to break.

- **"One heat, one job" only held while the first job was still open.** I had it hide a Heat's
  work behind whatever work was open about her. Serve her on the morning of her heat, and the
  evening sighting had nothing open to hide behind — so it raised a second job for a cow just
  served. Two sightings reaching the farm together from a phone with no signal both raised jobs,
  because neither was open yet. **The open work was the wrong thing to ask.** Which sightings begin
  a heat is now decided from the sightings themselves, and it gives the same answer however late
  they arrive. That also deleted the rule's string-prefix check and a query that read every open
  job about every animal on the farm on every app-open. A mutation check confirmed the new tests
  go red when the rule is broken.
- **A heat corrected away left its AI work standing**, sending somebody to serve a cow who was not
  in heat. Withdrawing the Observation stopped *new* work being raised on it and did nothing about
  work already raised. It closes that work now.
- **A heat that reached the farm after its window had closed was indistinguishable from
  negligence.** On a farm whose sheds have no signal that is an ordinary morning, not an edge: a
  dawn sighting reaches the farm when the phone does. The work is still raised — never dropped
  (ADR 0002) — and it goes on the Manager's queue as a late entry, so a lost service window is put
  down to a phone's lag and the Manager can decide whether she is still worth serving.
- **Her page lost older heats.** It picked them out of her last twenty Observations, and a twice-
  daily round writes one for every cow — so her page held about a week, and the heat that matters
  after a failed service is three weeks old. Heats are read on their own now, and each one links
  to the work it raised.
- **The window could be set longer than a day**, and its length becomes the work's grace, while the
  late-work sweep only looks back as far as the longest grace any work may have — so a missed
  service could have gone late with nobody told. Capped at a day.
- **Stale comments**: the slot builder and the `Happening` type still described a world with no
  heats. **"Bulling" is on the glossary's _Avoid_ list** and was on the button. **One string, two
  meanings**: the event name and the Observation's word are now the one constant.
- **The test's `finally` put the window back to 12 and 18** rather than to whatever it found.

## Decisions and departures

- **A days offset on a heat trigger is refused at publish.** The window is the farm's, in hours; a
  number of days would be accepted and silently ignored, and a setting the Playbook accepts and
  does not honour is how an author comes to believe the farm does something it does not.
- **The work lands on the day it is due.** A heat seen at noon has its AI work due at midnight, on
  the next farm-day's list. That is honest — it is due tomorrow — and the test uses morning heats
  so the arithmetic reads plainly.

## Found on the way

`pnpm check-types` output is coloured now, so `grep "error TS"` silently matched nothing — an empty
result that reads exactly like a clean build. Main was checked with the colour stripped and was
genuinely clean, so no earlier verification was false; but the first stripped check on this branch
immediately caught a real error the old grep hid (the SOP editor had no words for the new `heat`
event). Written into session memory.

## Not done, and why

- **The heat-watch and AI procedures are not seeded.** Like every procedure on this farm, the Owner
  writes and publishes them; the test publishes its own.
- **Nothing counts failed services yet.** A Heat that leads nowhere is ticket 44's and 47's
  business.
- **Owners and Managers can record a Heat by stepping into the round**, though the roles matrix gives
  them read only on Heats; and Barn Staff can read Heats on her page, though the matrix gives them
  create only. Both are the existing rules for every Step and every Observation rather than
  anything this ticket introduced — the same shape recorded against the Weigh-in in ticket 36 — so
  they are written down rather than changed here.
- **48 hours is a fact about cattle, not a Farm Parameter.** Named, and explained where it lives.

## Verification

`pnpm check-types` clean across the workspace with colour stripped; `pnpm test` 408 passing (379
api + 19 web + 10 i18n), up from 398 — a heat raising the work in the window; a second sighting
raising nothing while the first job is open, **after she has been served**, and **when two sightings
reach the farm together**; a new heat three weeks later raising new work; a heat corrected away
taking its work back; a heat that arrived after its window raised and put on the Manager's queue;
the window following the Manager's parameter; a days offset refused at publish; and her heats on
her page, each linked to its work.
`pnpm build` clean; `oxfmt` and `oxlint` clean on every changed file.
