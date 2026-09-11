# 30 — Vaccination and deworming campaigns

**What to build:** The Manager runs a vaccination or deworming over a Pen as one piece of work with a per-animal Step, so that every animal ends up with the event in her own history — which is what a slaughter vet asks for, per animal, not per campaign. An animal skipped carries the reason she was skipped.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 3, user story 56.

- [ ] A campaign is one Instance per Pen with a per-animal Step, raised the way the Playbook raises everything else
- [ ] Completing it writes the event on each animal, naming the product from the Drug List
- [ ] A vaccination with a withdrawal sets one, like any other treatment
- [ ] An animal skipped carries her reason, and the campaign can still finish
- [ ] Tests cover a campaign over a Pen, a skip, and the per-animal history it leaves
