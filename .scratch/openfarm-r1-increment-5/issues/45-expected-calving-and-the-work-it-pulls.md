# 45 — Expected Calving, and the work it pulls towards it

**What to build:** Once the farm knows when she is due, two pieces of work are owed before she calves: drying her off sixty days out, and preparing her seven days out. Both are counted backwards from a date the farm worked out, which is a thing the Playbook cannot yet express — a Trigger today counts forward from something that happened.

Two decisions from the Owner, 2026-09-13. **If the date moves, the work moves with it**: work still open goes to the new day, work already done stays done, and the trail says why the day changed. And **a heifer bought in already pregnant is asked for her due date at intake**, on the one screen where somebody knows the answer, so everything downstream works for her exactly as for a home-bred cow.

**Blocked by:** 44

**Status:** done

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
the farm's day that many days before her Expected Calving, and is raised as soon as a date is known.
It is looked back for by the calving, not by its own day: a cow who reaches the farm three weeks from
calving still gets her dry-off, late and on the Overdue list. The SOP editor offers the new Trigger,
and no longer offers a "days after" box for a Heat or a Service, where publishing refused one.

**Drying her off puts her in Dry.** A new `dry_off` Step Effect, walked cow by cow. A replay finds her
Dry already and dries nobody twice. A cow not in milk is refused. If the entry that dried her is
corrected to a skip, she stays Dry and the Manager gets a Needs Review, as an irreversible Move does:
put back in Milking from there, she would look freshly calved to every State-triggered procedure. An
entry that dried nobody, because she was Dry already, asks nobody anything. **Calving prep needs no new
effect**: its Step is a Move to the calving Pen the Owner authors.

**When the date moves, the work moves with it.** Calving work is keyed on the calving — the cow and the
Lactation it will end — not on the date or where the date came from. Whenever Expected Calving
changes, her open calving work goes to its new day, and work already done stays done and is never
raised twice. The date can change through a service or check it is worked out from, a date entered at
intake being put right, or the Manager changing the gestation or a lead.

When no calving is expected any more, the open work closes: a positive put right, or a calving
recorded by hand. When one is expected again in the same Lactation — a positive corrected away and
then back — the work that closed comes back on its day. What moved, closed or came back goes on the
trail. For a service or check, it goes in the Completion's entry, which a Correction's entry now
carries as well. For a corrected date, it goes in the Correction's own entry, with the reason. For a
parameter change, it goes in the Farm Parameters entry.

**A Pregnant Heifer registered is asked when she will calve.** Registering one is refused without an
Expected Calving. So is a day already gone, or one further off than a gestation. The opening register
takes an optional `expected_calving` column for a heifer or cow already in calf. That date is marked as
*entered*, so it can be put right by hand with a reason (`correctExpectedCalving`). One worked out from
a check cannot be typed over; it is corrected through the service or check it came from.

**Seven tests**, in a year no other test file uses:

- **Home-bred cow:** served, checked, dried off on the right day, and walked to the calving pen on the
  right day.
- **Bought-in heifer:** refused without a date, then given calving prep and no dry-off.
- **Entered date corrected:** her open prep moves and her finished dry-off stays, with the move and its
  reason on the trail.
- **Derived date:** refused for typing over.
- **Mistaken positive:** corrected away closes both pieces of work and says so on the trail; corrected
  back, the work returns.
- **Cow on the register three weeks from calving:** her dry-off is raised late. A dry-off entry that
  dried nobody raises no review when skipped. Her calving, recorded by hand, closes her prep and
  nothing comes round again.
- **Lead changed and put back:** her open work moves both ways.

Mutation-checked, each red: no moving; dry-off drying nobody; one lead for both procedures; no date
required; a derived date typed over; finished work moved; a derived calving not raising work; never
closing; the effect missing from a Correction's trail; never reopening; looking back by the work's own
day; a calving leaving the date standing, or not closing the work; no retiming on a parameter change;
any Dry cow raising a review.

## What the review changed

The standards axis found two bugs in the key:

- **Keying calving work on where the date came from** meant a service correction after dry-off was
  done raised a second dry-off under the new key.
- **The clash guard** could close her last open dry-off.

The key is now the calving alone, and a closed calving's work comes back when it is expected again.

Also from the standards axis:

- **A skipped dry-off raised a false Needs Review** on any Dry cow.
- **"calving_due" and the Bangla copy used the glossary's avoided *due date*.**
- **The day schema was declared twice.**
- **Three doc comments were stale.**
- **A lead validator went unused.**

The spec axis found:

- **A calving recorded by hand brought the prep back overdue.** Her Lactation number moved on, but her
  date stood.
- **A cow on the register close to calving never got her dry-off.** It fell before the fortnight
  looked back.
- **Changing gestation or a lead moved nothing**, against the Owner's decision that work moves with its
  date.
- **The acceptance criterion says any Pregnant Heifer registered is asked for a date.** I had required
  it only for one bought in, to spare tests that use one as a shortcut. Only one test file registered
  one that way. It now registers a Heifer and moves her on.

## Decisions made here

- **The leads are Farm Parameters, and the Trigger names the lead, not a number.** The ticket's words
  were "so many days before", but the spec lists both leads as Farm Parameters, and the Heat and
  Service triggers already work this way.
- **Manual `setState` to Pregnant Heifer still sets no date**, so it raises no calving work. It is the
  Manager's escape hatch, and closing it is a separate decision.

## Left open

- **Closed calving work is marked missed**, like the other work this increment closes: the same Owner
  question as ticket 44. A calving expected again reopens *missed* work of the same Lactation, which
  would include a dry-off somebody genuinely missed.
- **A service or check that moves the work gives no reason of its own.** The Completion is the reason,
  and a Correction carries one.
- **Undoing a positive on a cow who also had an entered date loses the entered date.** A heifer bought
  in carrying is not normally served, so this is unlikely.
- **Whether a dry-off entry dried her is read from her State changing at the moment the entry was
  recorded.** A hand change at the same millisecond would be mistaken for it. A Dry-off record of its
  own belongs with Calving (ticket 46), where Lactations start and end from records.
- **Calving itself (ticket 46)** clears Expected Calving, as a hand-recorded calving now does.
