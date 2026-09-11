# 19 — Feed Items and a Ration per Pen

**What to build:** The Manager defines the farm's Feed Items in Bangla and gives each Pen a Ration: how many kg of each Item one animal in that Pen gets per day. Changing a Ration publishes a new Version of it, exactly like an SOP, so what a Pen was fed in March can still be shown in June. The target for one feeding is computed from the Pen's headcount at that moment and the Ration in force — nobody types a number the farm already knows.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 2, user story 72.

- [ ] Feed Items are created and retired by the Manager, Bangla required and English optional, like the Playbook
- [ ] A Ration belongs to a Pen and is versioned; in-flight work reads the Version in force when it was raised
- [ ] The target kg per Item for a session is derived from headcount × kg per animal per day ÷ sessions per day, and is shown with its working
- [ ] A Pen with no Ration is a state the screen names rather than a zero it displays
- [ ] Tests cover deriving the target across a headcount change and a Ration Version change
