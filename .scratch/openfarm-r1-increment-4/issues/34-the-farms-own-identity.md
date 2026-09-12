# 34 — The farm's own identity

**What to build:** The farm knows what it is called and nothing else about itself. Every document it sends out needs more than that: the transport card must carry the farm of origin's name, address and DLS registration number (Meat Rules 2021 r.18), and the letter to the Upazila Livestock Officer should say how to reach the farm. The Owner writes these down once, and every document from then on prints complete.

**Blocked by:** None — can start immediately.

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md); [Compliance reports and exports](../../openfarm-release-1/issues/19-compliance-reports-and-exports.md) — R10; [DLS farm registration evidence](../../openfarm-release-1/issues/22-dls-farm-registration-evidence.md). Confirmed with the Owner 2026-09-12: address, phone and registration number are added now so both documents are complete, and increment 7 adds only the renewal and its evidence.

- [x] The Owner or the Manager records the farm's address, phone and DLS registration number with its office and expiry — the roles matrix gives farm parameters to both, and the registration decision says the Manager enters it from the certificate at go-live; Barn Staff and the Vet may not
- [x] The letter to DLS carries the farm's contact details, and ticket 32's blank is closed
- [x] A registration number that is missing or expired is visible to the Owner, so the farm knows before an inspector does
- [x] Changing any of them is an Audit Event with what it was before
- [x] Tests cover the Manager recording them, the letter carrying them, Barn Staff being refused, and an expired registration being visible

## What was built

`farm.setIdentity` (Owner or Manager) and `farm.identity()` (anyone on the farm), kept apart
from `setParameters` — the Parameters are numbers the Manager tunes, and this is what the farm
*is*: the words printed on papers that leave it. Six nullable columns on `farm`, so the migration
is safe on a farm that already has rows.

`identityView` in the domain derives the three facts a screen asks — nothing written down,
run out, running out — rather than storing them, because "expired" is a fact about today. A
certificate that says it expires on the 31st is good all of the 31st, so the registration has run
out only once that whole day is behind the farm.

The letter to the Upazila Livestock Officer now heads with the farm, its address, its phone and
its registration number — each line appearing only if the farm has written that fact down, because
a notifiable disease must not wait for paperwork. **This closes the blank ticket 32 recorded.**

The screen is `/admin/farm`, reached from the nav by the Owner and the Manager only (the `/admin`
layout already refuses everyone else).

## Decisions and departures

- **The registration date is a day, not an instant.** The router takes `YYYY-MM-DD` and reads it
  on the farm's clock, which is what `audit.list` already did for its day filters. The farm's UTC
  offset had been written down twice in two shapes; it is now in one place (`farm-clock.ts`) and
  the audit router and the instance store both take it from there.
- **`identity()` reads the request's own Farm**, not a fresh row — the Context carries the Farm as
  it stood when the request began, and every other router does the same. The tests therefore build
  a fresh client after each write, which is the pattern the parameter tests already use.
- **The farm's name is shown but not editable here.** It is set when the farm is created; changing
  it is a different act with different consequences, and this ticket did not ask for it.

## Not done, and why

- **No photograph of the certificate.** The Owner's decision put the renewal SOP and its evidence
  in increment 7; this ticket carries only the facts an inspector asks for first.
- **Nothing yet prints the transport card.** Ticket 40 does that; what it needs now exists.
- **The expiry is visible but says nothing on its own.** Nobody is told when ninety days arrive —
  that is the renewal SOP's job in increment 7. Today the Owner or Manager has to open the screen.

## Verification

`pnpm check-types` clean across the workspace; `pnpm test` 366 passing (337 api + 19 web + 10
i18n), up from 364; `pnpm build` clean; `oxfmt` and `oxlint` clean on every changed file.
