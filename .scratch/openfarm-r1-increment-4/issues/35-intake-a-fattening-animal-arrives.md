# 35 — Intake: a fattening animal arrives

**What to build:** The Manager takes in an animal for fattening: where it came from and for how much, what it weighed on arrival, roughly how old it is, a photograph, and the window it is being fed for — which is the next Eid-ul-Adha unless the Manager says otherwise. The farm gives it its own `F-` number, puts it in the quarantine pen, and from that moment it is an animal the farm is feeding towards a date and a weight.

**Blocked by:** None — can start immediately.

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 4, user story 60; [Fattening, weights and sale](../../openfarm-release-1/issues/10-fattening-weights-and-sale.md) ("Intake"); [Animal identity scheme](../../openfarm-release-1/issues/06-animal-identity-scheme.md).

- [x] The Manager records an intake: seller name and place, purchase price, intake weight, estimated age, breed if known, a photo, a Target Window and a target weight
- [x] The Target Window defaults to the next Eid-ul-Adha, and the Manager may move it
- [x] She gets the next `F-` number and enters Quarantine in the pen the Manager names; Barn Staff cannot take an animal in
- [x] Her page reads as an intake: what she cost, what she weighed, and what she is being fed towards
- [x] Tests cover an intake, the Eid default, the number she is given, and everybody else being refused

## What was built

`intake.record` (Owner or Manager): the seller, what the farm paid, what it weighed off the lorry, its estimated age and breed, the Target Window and the target weight. The Animal and the Intake are written in **one transaction** — an animal with no account of where it came from is exactly what a half-finished arrival would leave behind — so `createAnimal`'s transaction body was first pulled out into `herd-store.insertAnimal`, which takes a transaction rather than opening one.

Two new tables. **Counterparty** is the glossary's own word ("a person or business the Farm buys from, sells to, or pays… shared across Sale, Dispatch, Intake, Purchase and Money Events"), found by name rather than chosen from a list, because that is how the Manager knows a trader. **Intake** holds what never changes about an arrival; what the animal weighs _today_ is a Weigh-in's business (ticket 36).

`nextEidWindow` in the domain reads a **table** of Eid-ul-Adha dates, not a calculation. The day is 10 Dhul Hijjah, fixed for Bangladesh by the moon sighting committee and usually a day after Saudi Arabia — so it is not calculable, and the honest thing is a table kept a decade ahead with the Manager free to move any animal's window once the year's date is announced. Qurbani runs three days, so a window is three days, and it stays current until its last day is past.

The screen is `/admin/intake` — the Manager standing at a lorry types the four things only they can know, and the window and the target weight fill themselves in. Her page now opens with **how she arrived**: what she cost, what she weighed, and what she is being fed towards.

## What the review changed

Both axes found real things, and all of them are folded in.

- **I ticked a criterion I had not met.** The ticket asks for "a photo"; the spec's story 60 and the glossary both list one; and my own "Not done" note said there was none — the tick and the note contradicted each other on the same page. The intake form takes a photograph now, sent after the animal exists (a photo belongs to an animal, and there was none until a moment ago). A photo that fails to go up does not undo the arrival: the animal is on the farm either way.
- **Intake was open to the Owner.** The roles matrix is explicit — _Intake / Sale: Owner `R; approve above threshold`, Manager `C R U`_. The Owner answers for the money, not for the buying. It is the Manager's alone now, refused by name so an Owner is told why rather than left looking for a permission to change; an Owner who does the buying on a small farm holds the Manager role too.
- **The new Farm Parameter could not be set.** `fatteningTargetWeightKg` reached the table, the Context and the audit snapshot but never the input schema, so it was a hard-coded 350 nobody could change — which made the whole "one number the Manager may tune" departure untrue. Fixed and tested.
- **Estimated age was optional**, though story 60 marks only breed optional. Required, in the schema and on the form.
- **Two traders with one name silently merged**, discarding the second's address and phone. The farm now keeps what it knew and learns only what it lacked, and `intake.sellers` lets the Manager see who the farm already deals with.
- **Two doc comments were orphaned** by my insertions — `recordMove`'s in `herd-store.ts` and `HowSheWent`'s on the animal page. Sixth and seventh time this session. Both put back.
- **"Seller" and "place" were new words** for a Counterparty and its address. The column is `address` again, and CONTEXT.md's Counterparty entry is widened to say that _seller_ and _buyer_ are the sides he stands on, not a second kind of record.
- **The farm's clock had a fourth copy**, this time hardcoded as `+06:00` inside the browser. It now lives in `packages/domain/src/farm-clock.ts`, where the server and the browser both reach it; the API keeps only the shape a request is validated against.
- **The Target Window travelled as two loose strings.** It is one `TargetWindow` through the view and the page.

The spec reviewer also checked the Eid table against the Hijri year: every interval is 354 or 355 days from 2026 to 2036, and 2026-05-28 matches Bangladesh.

## Decisions and departures

- **Target weight is one Farm Parameter, not "by class".** The spec says "target weight from a parameter by class"; the farm has no Weigh-ins yet and so no classes to tell apart. One number with a per-animal override, and the column comment says what it is waiting for.
- **A Target Window is two days, not one date.** The glossary calls it a period, and Qurbani is three days of selling. Stored as days rather than instants: Eid is a date in a calendar.
- **The seller may be named and nothing else.** A name is required; place and phone are what anybody remembers. A trader already known by that name is reused rather than written twice.
- **The photo is taken at the lorry but sent after.** `animals.setPhoto` needs an animal to hang it on, and there is none until the arrival is written — so the form holds the file and sends it once the animal exists. Optional, per the identity scheme: "optional at registration; prompted later if missing".

## Not done, and why

- **Nothing projects yet.** Days on feed, average daily gain and projected weight at the Target Window are ticket 37's, and they need Weigh-ins (ticket 36) to exist first.
- **No way to correct an Intake.** The matrix gives the Manager `U` on Intake and there is no procedure for it: a price typed wrong stays typed wrong. Correcting is the corrections module's own mechanism and a ticket of its own; recorded here rather than half-built.
- **Intake is not an SOP.** The decision calls it SOP 20; today it is a Manager's act on a screen, like every other arrival on this farm. Whether arrivals should raise work is a Playbook question, not this ticket's.
- **The purchase price is not yet a Money Event.** Finance is increment 6; the figure is recorded where the margin will be worked out from.

## Verification

`pnpm check-types` clean across the workspace; `pnpm test` 370 passing (341 api + 19 web + 10 i18n), up from 366; `pnpm build` clean; `oxfmt` clean and `oxlint` clean on every changed file (the one `no-use-before-define` in `herd-store.ts` pre-dates this ticket — it moved line but not existence).

The ticket's two migrations are squashed into one: two new tables and one column with a default, so it is safe on a farm that already has rows.
