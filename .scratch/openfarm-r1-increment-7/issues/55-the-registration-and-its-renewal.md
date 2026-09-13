# 55 — The Registration, and its renewal

**What to build:** The farm's DLS Registration is one of its few hard legal duties, and it runs out every 31 March. The Manager keeps the Registration record — number, issuing office, issue and expiry dates — with a photograph of the certificate. Ninety days before it expires, the renewal SOP (SOP 26) is raised for the Owner and the renewal sits on the Owner's queue. The renewal's last step asks for the new expiry date and a photo of the renewed certificate, and completing it updates the Registration record, audited (the Owner's decision, 2026-09-13), so the next renewal is raised on its own a year later.

**Blocked by:** None — can start immediately

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 7, user stories 94 and 97; [DLS registration evidence](../../openfarm-release-1/issues/22-dls-farm-registration-evidence.md); [Report set](../../openfarm-release-1/assets/report-set.md) — R1; `CONTEXT.md` — **Registration**, **SOP**, **Trigger**.

- [x] The Manager records a photo of the Registration certificate beside the number, office and dates; the photo is kept, replaced by a newer one, never lost from the trail
- [x] A renewal SOP is raised for the Owner once the expiry is within the Registration renewal lead (Farm Parameter, 90 days) — once per expiry, however often the farm is swept
- [x] The renewal due shows on the Owner's exception list until it is done
- [x] The renewal's closing step records the new expiry date and the renewed certificate's photo, and completing it updates the Registration record, with the change on the trail; a date before the old expiry is refused
- [x] Tests cover the photo, the SOP raised once at the lead, the Owner's queue, a renewal updating the record and raising nothing more until the next lead, and a refused date

## What was built

**Work about the whole farm** (a prefactor). An SOP Instance's Pen may now be null, for work in no Pen:
- **The null-Pen paths:** people told, who may work it, overdue lists, a Step's animal and a feeding or milking effect each say what a null Pen means.
- **Staff:** Barn Staff see farm-level work only when it is assigned to them.
- **Guards:** a Pen's effects refuse farm-level work (`work_in_no_pen`), and farm-level work must be raised with a cause.
- **Screens:** notices, lists and the work screen say "the whole farm" where they used to name a Pen.

**The certificate** (`farm.setCertificate`, the Owner's or the Manager's from a personal phone) is kept for ever as its own photograph rows:
- the newest is the certificate now;
- `farm.certificates` lists them all, and `farm.certificate` shows the current one or an earlier one by id;
- each photograph is an Audit Event.

**The renewal Trigger** (`registration_renewal`):
- **When:** once the Registration comes within the renewal lead (a Farm Parameter, 90 days), `instances.ensureDue` raises renewal work in no Pen, assigned to the Owner.
- **Once a year:** it is raised once for each year's certificate. Putting a typed expiry right within the year raises nothing more.
- **Due:** it falls due on the day the Registration runs out, so it is late only once the farm is unregistered; it is on the Owner's list for the whole lead.
- **Telling the Owner:** raising it sends a `registration_renewal_due` notice in the Owner's digest.
- **The queue:** the Owner's exception list shows the renewal from the start of the lead until the renewal work is done, linking to the work.

**The renewal Step** (`registration_renewal` effect, the Owner's) records:
- the new expiry;
- the renewed certificate's issue date, when given;
- its photograph, as a new certificate row.

A date before the expiry it replaces is refused (`renewal_not_later`), as is a first renewal without a photograph (`renewal_needs_certificate`). A correction measures against the expiry the renewal replaced, and is refused once the Registration has moved on since (`renewal_superseded`). The Step's Audit Event shows the expiry before and after.

**Authoring:** a renewal procedure must be the Owner's. A procedure with the renewal Trigger may have no per-animal Steps and no Pen or animal effects. The SOP editor offers the Trigger.

**Web:**
- the farm page photographs the certificate and shows it;
- the work screen asks for the new expiry (starting a year on), the issue date and the photograph, and sends the renewal online, not through the shed phone's Outbox;
- the Owner's home has the renewal row.

**Four tests** in 2040–2042:
- **The certificate:** photographed, replaced, the earlier photograph still readable, two Exports, and Staff refused.
- **Authoring:** the renewal procedure refused to a Manager, and a per-animal Step refused.
- **Raising:**
  - not a minute before the lead opens at midnight, and raised at midnight, in no Pen, due at expiry;
  - raised once, with no second after the Manager puts the expiry right;
  - the Owner's digest notice;
  - on the Owner's list;
  - late only after it runs out, and on the Owner's overdue list but not Staff's.
- **Renewing:**
  - a renewal with no photograph refused, and an earlier date refused;
  - the renewal still on the list until done;
  - the new expiry, issue date and certificate, with the trail;
  - nothing more until the next year's lead;
  - a correction after the Registration moved on, refused.

**Mutation-checked, each red:**
- raised before the lead, or a day off, or more than once;
- keyed on the exact expiry;
- due at the lead;
- an earlier date or no photograph accepted;
- the expiry not moved, the issue date or the certificate dropped;
- the queue silent, or leaving before the work is done;
- no notice;
- a Manager given the procedure, or a per-animal Step allowed;
- the earlier photograph unreachable;
- a superseded correction allowed;
- Staff seeing the Owner's farm work, or photographing the certificate.

## What the review changed

The Standards and Spec reviews ran in parallel. Changed:

- **A replaced certificate photograph is kept.** The first version overwrote it, so the trail recorded that there had been a photograph but not what it showed.
- **Renewal work is keyed on the certificate's year, not its exact expiry.** A Manager putting a typed expiry right had raised a second renewal and left the first dangling.
- **The Owner is told in the digest when the renewal is raised,** per the notification table's "DLS renewal due → Owner, digest".
- **The renewal stays on the Owner's list until the work is done.** It used to go as soon as the Step moved the expiry.
- **The renewal records the renewed certificate's issue date,** so the R1 register (ticket 56) will not print a new expiry beside the old issue date.
- **Dates:** only a date *before* the old expiry is refused, as the ticket says; the same date is allowed.
- **A correction can no longer undo a newer renewal or a hand edit.**
- **Barn Staff do not see the Owner's farm-level late work.** Notices and lists say "the whole farm" instead of a blank Pen.
- **Farm-level work guards:**
  - it must be raised with a cause, since a null Pen is unique from every other in the index;
  - its SOPs may carry no per-animal Steps or Pen effects;
  - a Pen effect refuses it with a refusal word.
- **The renewal Step is sent online,** not through the Outbox, which keeps photographs out of a Step's entry (ADR 0002).
- **Tidying:**
  - an orphaned doc comment on the work screen restored;
  - the photograph input shared;
  - the good-until moment shared with the identity view;
  - `renewalDueAt` renamed `renewalOpensAt`, since it is when the work is raised, not when it falls due;
  - the self-timed Trigger kinds written once;
  - a tie-break on the queue's lookup;
  - a sentinel Pen id removed;
  - the Owner's row said once.
- **Tests:**
  - the lead opening to the minute;
  - a hand edit;
  - the notice;
  - Staff scoping, with a Pen of their own so the scoping actually runs;
  - the issue date;
  - the list until done;
  - the earlier photograph;
  - the superseded correction.

## Left open

- **The renewal falls due on the day the Registration runs out,** not when the lead opens. The registration decision says "auto-due 90 days before expiry"; this reads that as raised then. Work due at the lead would be late, and escalate to the Owner, from its second day for three months. **Owner question:** raise it at the lead and let it be late from the start, or keep it due at expiry?
- **The renewal Step checks that the person holds the Owner's Role,** not that they worked it as the Owner. A Manager can claim the renewal, as they can any work, but cannot complete its closing Step.
- **The Registration number and issuing office** are still changed on the farm page, not by the renewal.
