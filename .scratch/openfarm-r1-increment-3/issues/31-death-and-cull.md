# 31 — Death and Cull

**What to build:** The Manager records that an animal died or was culled: when, the cause as far as the farm knows it, and how the carcass was disposed of. She leaves the herd — off the pen boards, out of the day's work, out of the headcounts — and everything recorded about her stays exactly where it is. Disposal is evidence: the burial rule exists and an inspector may ask.

**Blocked by:** None — can start immediately.

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 3, user story 57.

- [x] The Manager records a Death or a Cull with its cause and disposal method; Staff cannot
- [x] The animal leaves the herd everywhere at once, and her history is untouched
- [x] A mortality shows on her page and counts towards what the farm reports
- [x] Recording one is an Audit Event like any other, and correcting it is a Correction
- [x] Tests cover a death, a cull, the animal leaving the day's work, and Staff being refused

## How it was built

**One act, one transaction.** She reaches her exit State and the Mortality is written together,
so from that moment she is off the pen boards, out of the day's work and out of the headcounts —
everywhere at once, because everywhere reads the same State. Nothing of hers is removed: the
mortality register an inspector reads is these rows, and the six-month disease history behind a
slaughter certificate is the ones beside them.

**Disposal is evidence.** The burial rule is six feet and an inspector may ask which it was, so
buried or burned is recorded beside the cause, with a note for where and how. Both came from the
Playbook list and the report set rather than from the ticket's own wording.

**The cause is what the farm knows, not a diagnosis.** A Vet's conclusion about what killed her
is a Diagnosis and it is the Vet's to record; this is the Manager saying what she found and what
she did with the body.

**Work about her is closed with her.** A dose due tomorrow, a check her last Move raised — both
would have gone late and told somebody about a cow who is buried. They are closed as missed,
which is the farm's word for work that will not happen: settled, but not finished, with the
reason in the Audit Event that closed it.

**And her death raises the work the Playbook holds for it.** A death is now a farm event a
Trigger can name, so the mortality-handling entry the Playbook list has always described — bury
her to the depth the rule names, Owner checks it — can be written and raised. It is the one event
that raises work about an animal who is no longer here, which is precisely why it exists.

## Cut, and owed

- **"DLS report ref if notifiable"** (report set R6) has no home yet: the Mortality carries no
  notifiable flag and no link to the report. Ticket 32 writes the letter, and the link belongs
  with it.
- **A culled animal can never be sold.** The lifecycle doc says "if the cull ends in a sale the
  sale record is still made", and once she is Culled every further write is refused. That is
  increment 4's knot to untie, with the Sale in front of it.
- **Sold is still a State somebody sets.** A death and a cull now need their record; Sold has no
  record of its own until increment 4, and refusing it here would leave the farm unable to say a
  cow was sold at all. It joins them when the Sale exists.
- **A campaign in her Pen still counts her out silently** — ticket 30's recorded gap, unchanged.

## Review outcomes folded in

Two-axis review of `678f8c5`. Both axes found the same two holes, which is usually a sign they
are the real ones.

- **Both axes — `setState` was a back door.** A Vet could set `died` outright, which the roles
  matrix forbids, and it wrote no cause, no disposal and no Mortality: `byTag` would then report
  a dead cow with `mortality: null`, and a Correction would answer NOT_FOUND for ever. A death
  or a cull is now refused as a State change, by name. Three existing tests used that door and
  now go through the front one.
- **Both axes — the Correction chain never linked.** `recordExit` audited against the animal
  while the Correction looked for the Mortality, so `supersedesId` was never set and the
  mortality's own facts reached the trail only through the reason field. Both events are keyed on
  the Mortality now, and the snapshots carry what it says.
- **Spec — her open work outlived her**, going overdue and raising alerts about a buried cow.
  Closed as missed, and tested.
- **Spec — the Playbook's mortality handling could not be built.** Nothing could name a death as
  a trigger. Now it can, and a test proves the handling work is raised.
- **Spec — a death written up as a cull could not be fixed.** It can: the row and her exit State
  move together under one Correction.
- **Spec — the day's-work assertion was conditional** (`if (round)`), passing silently when no
  Instance existed — which it never did, because a Staff member sees only the Pens they are
  assigned to and nobody is assigned to a Pen made a minute ago. Asked as the Manager now, and
  unconditional.
- **Spec — the Correction had no screen**, and the form could not say she was found at dawn and
  written up at noon. Both on her page now.
- **Standards — `recordExit`/`correctMortality` was two names for one row**, and "exit" is a word
  the glossary's Sale entry says to avoid. `recordMortality`.
- Plus: the mortality window has its own constant rather than borrowing the late-work list's, the
  props are typed by the domain's own unions, both updates scope to the Farm, and **Disposal**
  now says explicitly that it is never a word for a Sale.

**Defended:** the spec axis called the Owner's died/culled tiles scope creep, quoting my own
comment that the register is increment 7's. They stay. "Counts towards what the farm reports" is
an acceptance criterion, the register is three increments away, and a farm should not have to
wait until then to see what it has lost this month.
