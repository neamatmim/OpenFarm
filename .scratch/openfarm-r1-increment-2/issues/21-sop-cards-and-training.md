# 21 — SOP Cards and who was trained on them

**What to build:** Every published Version can be printed as a one-page Bangla card — the purpose, the Steps, the icons and what Evidence each needs — so the training material on the shed wall is always the procedure actually in force. The Manager marks a Staff member as trained on a Version, and the farm can show who knew which procedure on any date.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 2, user stories 42 and 43.

- [ ] A Card is generated from a published Version, in Bangla, and prints on one A4 page
- [ ] The Card names its Version and the date it was published, so a card on a wall can be checked against the Playbook
- [ ] The Manager records "trained on this Version" per person; it is an Audit Event, never a flag that can be edited away
- [ ] A person's training shows on their page and on the SOP's
- [ ] Tests cover generating a Card and recording training
