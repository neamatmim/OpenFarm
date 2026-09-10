# 05 — Sheds, Pens and the Animal register

**What to build:** The Manager sets up Sheds containing Pens and registers Animals with only Tag Number (assigned by the system), sex, Side, Pen and source; breed, estimated age and a profile photo can be added later. Tag Numbers are `D-0001…` for Dairy-born and `F-0001…` for Fattening intake, sequential per prefix, never reused, unchanged when an Animal changes Side. An Official Tag is an attribute. A lost tag is replaced with the same number as a recorded Re-tag. Moving an Animal between Pens or Sides is a recorded Move — the only way its location changes. The lifecycle State machine lives in a shared domain package used by server and client. The opening register imports from CSV with old marks kept as aliases. Staff see the animals in their assigned Pens with photos and can look up any animal by Tag Number.

**Blocked by:** 04

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 1.

- [ ] Sheds and Pens can be created and renamed; every Animal is in exactly one Pen at all times
- [ ] Registering an Animal with the five mandatory fields assigns the next Tag Number for its Side prefix; numbers are never reused, even after an exit
- [ ] Photo upload sets the profile photo; it appears wherever the animal is picked
- [ ] Re-tag records the event and keeps the Tag Number; Official Tag is stored but never used as identity
- [ ] Move changes Pen (and Side when crossing) and records the Move; an Animal changing Side keeps its Tag Number
- [ ] The State machine from the spec is enforced: illegal transitions are refused with a named error; legal ones are recorded
- [ ] CSV import creates Animals with aliases and reports rows it could not import
- [ ] Staff scoping: a Staff client lists only its assigned Pens' animals but can fetch any single animal by Tag Number read-only
- [ ] Tests cover numbering, Re-tag, Move, State transitions (including the scenarios in the lifecycle ticket), import and scoping
