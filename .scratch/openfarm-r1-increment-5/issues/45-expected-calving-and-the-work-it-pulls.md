# 45 — Expected Calving, and the work it pulls towards it

**What to build:** Once the farm knows when she is due, two pieces of work are owed before she calves: drying her off sixty days out, and preparing her seven days out. Both are counted backwards from a date the farm worked out, which is a thing the Playbook cannot yet express — a Trigger today counts forward from something that happened.

Two decisions from the Owner, 2026-09-13. **If the date moves, the work moves with it**: work still open goes to the new day, work already done stays done, and the trail says why the day changed. And **a heifer bought in already pregnant is asked for her due date at intake**, on the one screen where somebody knows the answer, so everything downstream works for her exactly as for a home-bred cow.

**Blocked by:** 44

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 5, user stories 69 and 70; [Breeding and reproduction](../../openfarm-release-1/issues/11-breeding-and-reproduction.md) (steps 4 and 5, and the Consequences note on event-relative triggers).

- [x] The Playbook can say "so many days before an Animal's Expected Calving", and the dry-off and calving-prep SOPs are written that way with the decided leads
- [x] Drying her off puts her in Dry; calving-prep moves her to the calving Pen
- [x] When her Expected Calving moves, work still open moves with it and work already done is left alone; the trail records the move and its reason
- [x] A heifer registered as already pregnant is asked when she is due, and the same work is raised for her
- [x] Tests cover both SOPs falling due at their leads, a date moving open work but not finished work, and a bought-in pregnant heifer getting the same treatment as a home-bred cow

## What was built

**The Playbook can hang work before a calving.** A new Trigger, *before calving*, names which lead it
keeps — dry-off or calving prep — and the days are Farm Parameters (`dryOffLeadDays` 60,
`calvingPrepLeadDays` 7), as the spec lists them. It follows the Heat and the Service: the farm times
this work, not the Version, so every cow is dried off the same number of days out. The work falls on
the farm's day that many days before her Expected Calving, and it is raised as soon as a date is known,
months ahead. The SOP editor offers the new Trigger, and no longer offers a "days after" box for a Heat
or a Service, where publishing refused one.

**Drying her off puts her in Dry.** A new `dry_off` Step Effect, walked cow by cow. A replay finds her
Dry already and dries nobody twice. A cow not in milk is refused. Corrected to a skip, she is not put
back in milk: a cow returned to Milking from there would look freshly calved to every State-triggered
procedure, so she stays Dry and the Manager gets a Needs Review, as an irreversible Move does.
**Calving prep needs no new effect**: its Step is a Move to the calving Pen the Owner authors.

**When the date moves, open work moves with it.** Calving work is keyed on the cow, the Lactation the
calving will begin, and where the date came from — the service it counts from, or *entered* — not on
the date. Whenever Expected Calving changes, her open calving work goes to its new day, and takes the
new key if the date now comes from a different service. Work already done stays done. With no calving
expected any more — a positive put right — the open work closes. What moved and what closed goes on
the trail: in the Completion's entry when a service or a check caused it, which a Correction's entry
now carries as well, and in the Correction's own entry when an entered date is put right, with its
reason.

**A heifer bought in carrying is asked when she will calve.** Registering a Pregnant Heifer bought in
is refused without an Expected Calving. A day already gone is refused, and so is one further off than
a gestation. The opening register takes an optional `expected_calving` column for a heifer or cow
already in calf. Her date is marked as *entered*, so it can be put right by hand with a reason
(`correctExpectedCalving`). One worked out from a check cannot be typed over: that date is corrected
through the service or check it came from.

**Five tests**, in a year no other file uses: a home-bred cow served, checked, dried off on the right
day and walked to the calving pen on the right day; a bought-in heifer refused without a date, then
given calving prep and no dry-off; an entered date corrected, moving her open prep and leaving her
finished dry-off alone, with the move and its reason on the trail; a checked date refused for typing
over; a mistaken positive corrected, closing both pieces of work and saying so on the Correction's
trail. Mutation-checked, each red: no moving; dry-off drying nobody; one lead for both procedures; no
date required; a derived date typed over; finished work moved; a derived calving not raising work;
never closing; the effect missing from a Correction's trail.

## Decisions made here

- **The leads are Farm Parameters, and the Trigger names the lead, not a number.** The ticket's words
  were "so many days before", but the spec lists both leads as Farm Parameters, and the Heat and
  Service triggers already work this way.
- **Only a heifer *bought in* must have a date.** Twelve existing tests register a home-born Pregnant
  Heifer as the way to a milking cow. The Owner's decision was about one bought in; a home-born heifer
  written in late gets her date from her service.
- **Manual `setState` to Pregnant Heifer still sets no date**, so it raises no calving work. It is the
  Manager's escape hatch, and closing it is a separate decision.

## Left open

- **Work closed because a positive was put right is marked missed**, like the other work this
  increment closes. The same Owner question as ticket 44.
- **Changing a lead or the gestation does not move work already raised.** Expected Calving is worked
  out again when a service or check changes, not when a Farm Parameter does. There is no screen for
  these Parameters yet.
- **A positive put right, then the same attempt found positive again, raises no new calving work.**
  Its causes are the same as the closed work's. Found positive from a different service, it does.
- **Calving itself (ticket 46)** clears Expected Calving and starts the next Lactation; its work key
  moves on with the Lactation number.
