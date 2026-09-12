# 30 — Vaccination and deworming campaigns

**What to build:** The Manager runs a vaccination or deworming over a Pen as one piece of work with a per-animal Step, so that every animal ends up with the event in her own history — which is what a slaughter vet asks for, per animal, not per campaign. An animal skipped carries the reason she was skipped.

**Blocked by:** None — can start immediately.

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 3, user story 56.

- [x] A campaign is one Instance per Pen with a per-animal Step, raised the way the Playbook raises everything else
- [x] Completing it writes the event on each animal, naming the product from the Drug List
- [x] A vaccination with a withdrawal sets one, like any other treatment
- [x] An animal skipped carries her reason, and the campaign can still finish
- [x] Tests cover a campaign over a Pen, a skip, and the per-animal history it leaves

## How it was built

**One table for a dose, because a slaughter vet does not care how it reached her.** A Treatment
is now one dose given, whether a Prescription's course owed it — its row written when the Vet
wrote the course, which is what makes a missed one visible as work nobody did — or a Campaign
gave it, where nothing was owed until the Pen was walked. Keyed on the work *and the animal*, so
the same entry arriving twice records one dose and a Correction back to a skip takes it off her.
What went in is the Treatment's own fact now rather than something read back through a
Prescription, which is exactly what lets a vaccination's Withdrawal be worked out by the same
code as an antibiotic's.

**The Version names the product**, so the farm's record says what every animal in the Pen was
given and the milker is not asked to choose. That gave a dose Step two shapes with a rule each:
one that doses the whole Pen must say which product, one that gives a prescribed dose must not,
and a procedure gives one dose, never two — two would write over each other's record of what
she had.

**Publishing checks the product** is on the Drug List with its withdrawal days written down, so
a campaign that could not be given safely is refused at the Playbook rather than in the shed
with a syringe in hand. And because a Version never changes (ADR 0001) while the Drug List can,
the dose itself checks again: retired is fine — the farm may still have stock and the days are
still written down — but a product whose withdrawal nobody can state does not go into an animal.

**Nothing raises a campaign.** A quarterly deworming has no time of day, and giving it one would
put it on the shed's list every morning for ever. So a Version may now have no Trigger at all —
the Playbook says what the work is, and `instances.raiseNow` lets the Manager or the Owner say
when, once per Pen per day however often the button is pressed. That also retires the old rule
that every SOP needs a Trigger, which was written when there was no other way for work to
arrive.

## Cut, and owed

- **An animal moved out of the Pen mid-campaign falls out of it silently.** The roster is the
  Pen's animals *now*, so she ends up with neither the dose nor a reason, and the campaign
  finishes clean. Fixing it means snapshotting the roster when the work is raised — which is a
  change to how every piece of pen work decides who it covers, not a corner of this ticket. It
  is the one gap against "every animal ends up with the event in her own history".
- **A Vet cannot record a single vaccination on a visit.** The decision doc's Health events table
  has "Vaccination | Vet, or Staff under a campaign SOP"; the campaign half is built and the
  Vet's own half is not. A Vet visiting one animal has nowhere to put a jab that is not a
  prescribed course.
- **A Vaccination, a Deworming and a Treatment dose are all Treatments.** The product says which
  it was, which is what the record is for; the decision doc lists them as separate event rows,
  and nothing in the farm distinguishes them beyond the product's name. Worth revisiting if a
  report ever needs to count vaccinations.
- **A campaign's Withdrawal is the product's**, so a vaccine whose days are zero holds nothing.
  That is right, and it means the Drug List must carry a zero rather than a blank for those.

## Review outcomes folded in

Two-axis review of `d696d19`; both axes found things that would have reached the farm.

- **Both axes — the migration would have failed on any farm that has treated an animal.**
  `ADD COLUMN product_id text NOT NULL` with no backfill, and every dose from ticket 28 has no
  product of its own. The tests could not catch it: they build the database from empty. Rewritten
  by hand — add nullable, backfill from each dose's Prescription, then set NOT NULL.
- **Spec — a Manager could not actually run a campaign.** The only shapes on offer were a time of
  day, an event, or a State, so a published deworming would have raised work in every Pen every
  morning for ever. Hence `raiseNow` and Versions with no Trigger.
- **Spec — two dose Steps in one Version would have corrupted each other**, writing over the same
  row for the same work. Refused at publish.
- **Standards — the publish-time product check was unsound on its own** under ADR 0001: a Version
  keeps naming a product the Drug List has since retired, and nothing looked again. The dose
  checks too, and the refusal now says the right thing rather than blaming missing days for a
  retired product.
- **Standards — three doc comments had drifted off their functions**, including
  `applyObservationEffect` losing its own. Put back.
- **Standards — the glossary had fallen behind the code.** "Campaign" was in schema comments, an
  effect helper, a screen and a test file with no entry, and **Treatment** still read "one dose
  of a Prescription". Both fixed, and **Drug List** now says "prescribed or given". My own memory
  note says to grep CONTEXT.md before naming anything; I named it four times first.
- **Standards — the new dose Step defaulted to an invalid shape** (dose the whole Pen, no product
  named), so the Owner's first click produced a publish blocker. It defaults to the prescribed
  shape, which is complete on its own, and naming a product turns it into a campaign.
- Plus: a dead message key, three keys filed in the wrong block, a magic `limit: 40`, an
  unreachable failure path, a write that ran before its guard, and a unique index still called
  `treatment_instance_uidx` after its meaning changed — now `treatment_dose_uidx`.

**One production wart closed by a test collision.** Ticket 28 recorded "two treatment procedures:
the oldest wins, deterministically" as accepted. It bit twice in one run here — two test files
each publishing one, so a course raised work against the other file's procedure. The farm now
allows **one prescription-raising procedure at a time**: changing how the farm treats means
retiring the old procedure first, which is how the Playbook changes anything.

## Honestly

The shared test farm bit a third way, and it is the mirror of ticket 29's: work a file leaves
**open** on an early clock is maximally overdue at every later file's clock, so it floods the
front of the farm-wide overdue queue. My campaigns now finish what they raise. The assertion it
broke — counting rows in a queue capped at fifty — was the anti-pattern my own memory note warns
about, so I rewrote it to ask the day's work whether that Pen's round is late, which is the same
question and immune to the farm's backlog. Three clean full runs, and the note now carries all
three faces.
