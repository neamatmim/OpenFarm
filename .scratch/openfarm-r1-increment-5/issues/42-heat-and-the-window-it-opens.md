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

A Heat seen twice before she is served is one heat. Each is its own Observation, so nothing else
stops the second raising a second job, and a technician sent twice to one cow stops trusting the
list — open work about the same cow under the same procedure stands.

A heat Observation that a Correction withdrew raises nothing: work raised on it would send somebody
to serve a cow who was not bulling.

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

## Verification

`pnpm check-types` clean across the workspace with colour stripped; `pnpm test` 404 passing (375
api + 19 web + 10 i18n), up from 398 — a heat raising the work in the window, a second heat raising
nothing while the first is open, a cow seen and found not bulling raising nothing, the window
following the Manager's parameter, a days offset refused at publish, and her heats on her page.
`pnpm build` clean; `oxfmt` and `oxlint` clean on every changed file.
