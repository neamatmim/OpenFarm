# 34 — The farm's own identity

**What to build:** The farm knows what it is called and nothing else about itself. Every document it sends out needs more than that: the transport card must carry the farm of origin's name, address and DLS registration number (Meat Rules 2021 r.18), and the letter to the Upazila Livestock Officer should say how to reach the farm. The Owner writes these down once, and every document from then on prints complete.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md); [Compliance reports and exports](../../openfarm-release-1/issues/19-compliance-reports-and-exports.md) — R10; [DLS farm registration evidence](../../openfarm-release-1/issues/22-dls-farm-registration-evidence.md). Confirmed with the Owner 2026-09-12: address, phone and registration number are added now so both documents are complete, and increment 7 adds only the renewal and its evidence.

- [ ] The Owner records the farm's address, phone and DLS registration number with its expiry; the Manager may read them and not change them
- [ ] The letter to DLS carries the farm's contact details, and ticket 32's blank is closed
- [ ] A registration number that is missing or expired is visible to the Owner, so the farm knows before an inspector does
- [ ] Changing any of them is an Audit Event with what it was before
- [ ] Tests cover the Owner recording them, the letter carrying them, the Manager being refused, and an expired registration being visible
