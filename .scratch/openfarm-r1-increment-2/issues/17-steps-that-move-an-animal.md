# 17 — Steps that move an animal

**What to build:** Moving an animal between Pens becomes something the Playbook does, not something somebody remembers to do on an admin screen. A Step carries a Move Effect: completing it writes the Move, with the reason the Step recorded, in the Completion's own transaction. The animal's history reads back as one story — the work that moved her and the Move itself — and a Move made this way is correctable like any other entry.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 2 (animal movement SOPs), user story 39.

- [ ] A Step with a Move Effect writes a Move when completed, idempotent on the Completion like the Milk Record Effect
- [ ] The destination Pen comes from the Step's Evidence; a Pen that is not the farm's is refused
- [ ] The animal's history shows the Move and the Instance that caused it
- [ ] Correcting the Step re-runs or reverses the Move under the existing correction rules, or raises Needs Review when it cannot
- [ ] Tests cover the happy path, a replayed entry, and a correction
