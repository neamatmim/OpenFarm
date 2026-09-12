# 35 — Intake: a fattening animal arrives

**What to build:** The Manager takes in an animal for fattening: where it came from and for how much, what it weighed on arrival, roughly how old it is, a photograph, and the window it is being fed for — which is the next Eid-ul-Adha unless the Manager says otherwise. The farm gives it its own `F-` number, puts it in the quarantine pen, and from that moment it is an animal the farm is feeding towards a date and a weight.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 4, user stories 60–62; [Fattening, weights and sale](../../openfarm-release-1/issues/10-fattening-weights-and-sale.md) ("Intake"); [Animal identity scheme](../../openfarm-release-1/issues/06-animal-identity-scheme.md).

- [ ] The Manager records an intake: seller name and place, purchase price, intake weight, estimated age, breed if known, a photo, a Target Window and a target weight
- [ ] The Target Window defaults to the next Eid-ul-Adha, and the Manager may move it
- [ ] She gets the next `F-` number and enters Quarantine in the pen the Manager names; Barn Staff cannot take an animal in
- [ ] Her page reads as an intake: what she cost, what she weighed, and what she is being fed towards
- [ ] Tests cover an intake, the Eid default, the number she is given, and everybody else being refused
