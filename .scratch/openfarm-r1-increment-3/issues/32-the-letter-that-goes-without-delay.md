# 32 — The letter that goes without delay

**What to build:** The farm keeps a list of the diseases that must be reported, confirmed with the ULO. When the Vet records a Diagnosis on that list, the farm raises the DLS report SOP for the Manager immediately — "without delay" is what the Act says — and the Step generates the pre-filled Bangla letter to the Upazila Livestock Officer, then records when it was delivered and under what reference. A report that was sent and cannot be evidenced is a report that was not sent.

**Blocked by:** 27

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 3, user stories 58 and 59; [Bangladesh regulatory requirements](../../openfarm-release-1/issues/02-bangladesh-regulatory-requirements.md).

- [x] The farm maintains its notifiable-disease list; the Manager fills it from what the ULO confirms
- [x] A Vet Diagnosis on that list raises the report SOP for the Manager, due immediately, once per Diagnosis
- [x] The Step generates the letter in Bangla, filled from what the farm already knows, on one page
- [x] Delivery date and reference are recorded against it, and the export is an Audit Event
- [x] Tests cover a notifiable Diagnosis raising it, one that is not, the letter's contents, and delivery being recorded

## How it was built

**The list is the farm's own.** The research could not source the schedule of the Animal Disease
Rules, so what is reportable is what the Upazila Livestock Officer confirms to this farm — and
the note beside each entry is the farm's answer to "why did you report that one and not this
one". Owner, Manager and Vet keep it between them (roles matrix), which is also common sense:
the Vet knows the schedule, the Manager takes the letter, the Owner answers for the farm.

**"Without delay" decided the mechanism.** The report is owed the moment the Vet records the
Diagnosis, so it is created in that same transaction, the work to deliver it is raised due now,
and the Owner and the Manager are told immediately. A farm that waits for somebody to open an
app has waited. Once per Diagnosis, so one conclusion cannot be reported twice.

**The report exists even when the Playbook does not.** The duty is the Act's, not the Playbook's:
a farm that has published no report procedure still owes the office a letter, so the report row
is written either way and its Instance is null. That is what an Instance is for — remembering to
do it — and it is not what makes the duty real.

**The letter is one string in the domain**, not assembled on a screen, because it is a legal
notice the farm may have to produce again years later and it should read the same every time. It
carries only what the farm already knows: the office, the animal, the disease in the Vet's own
words, the date, the Vet, what has already been given, and the Act it is written under. It
refuses to be written at all with a blank farm, animal, disease or signatory — a page with a
hole in it should not reach the office.

**Delivery is the evidence.** The Step is completed when the letter arrives, so the moment it was
recorded is the moment it went, and the required note is the reference the office filed it
under. Publishing refuses a procedure whose reference can be left blank, and refuses one assigned
to Barn Staff: a legal notice resting on whoever is nearest the shed is not a legal notice.

**And ticket 31's loose end is tied.** A Mortality may name the Diagnosis it is attributed to, so
the register reaches the office's reference through the Diagnosis rather than through a flag
somebody has to remember to tick — which is what R6's last column asks for.

## Cut, and owed

- **The farm has no contact details.** R14 wants "farm identity & Registration no. … and
  contact"; the `farm` table has a name and nothing else. **Decided with the Owner 2026-09-12:**
  address, phone and registration number are added as farm parameters now, so both this letter and
  increment 4's transport card print complete. Increment 4 ticket 34 does it, and this letter picks
  them up there.
- **Matching is still on words.** The Vet types the disease and the farm matches it against the
  list, case-folded and trimmed. A typo means no report — so the Vet's screen should offer the
  list, and does not yet. The report now records *which* list entry matched, so at least the
  farm can say what it reported it as.
- **The letter says what was given, not what else was done.** Isolation, movement restrictions
  and the rest are not recorded anywhere yet.

## Review outcomes folded in

Two-axis review of `ea4b6b1`.

- **Both axes — with no report procedure the farm was told a lie.** An Alert said the disease must
  be reported without delay, and asking for the letter then refused with "that diagnosis is not
  one the farm's list says must be reported". The report row now exists without work behind it and
  the letter is always there to take.
- **Spec — a Corrected Diagnosis ignored notifiability, both ways.** Corrected onto the list: no
  report, no Alert, the s.3 duty silently missed. Corrected off it: the Manager left under orders
  to write a letter about a disease the Vet had taken back. Both handled now, and a report already
  delivered is left exactly where it is — that letter went. Tested in both directions.
- **Spec — a report procedure assigned to Barn Staff published cleanly.** Refused; the letter is
  the Manager's to take, or the Owner's.
- **Standards — nothing stopped a second report procedure**, so the oldest would silently win —
  the same wart ticket 30 closed for treatment. One rule now covers both acts that raise their own
  work.
- **Standards — the same crash as ticket 28, reintroduced by me.** Reading a Definition's content
  through `contentOf(definition.currentVersion?.content)` lands on `undefined.triggers` for a
  Definition with nothing published, which the farm can hold and which ticket 28's own test
  creates. It crashed the new publish check intermittently. Rather than patch it a second time
  there is now one safe way to ask: `publishedContent(definition)` returns the content or nothing,
  and all three callers use it.
- **Spec — "on one page" was not implemented**: printing carried the whole work board. The SOP
  card's own print isolation, reused.
- **Spec — R6's report reference had no path from a mortality.** It does now.
- **Standards — the nav label said "Reportable"**, a word my own glossary entry says to avoid.
- Plus: the letter says what was given; `noteIn` had been inserted between a neighbour's doc and
  its function (the fourth time I have done that); the effect's unreachable guard is gone and
  "nothing but spaces" is now decided in the one place that decides whether a required slot is
  filled; the three trigger↔effect pairing rules are one table; `raisesItsOwnWork` is a named
  predicate rather than the same disjunction in four places; and the list can carry an English
  name, which is what makes matching on one real.

## Honestly

One run showed a single unexplained failure in `animals.test.ts`'s "records a move and keeps the
side" that did not reproduce in seven subsequent runs (four api-only, three full). I have not
found it and have not fixed it. Everything else in this ticket was green in all of them.
