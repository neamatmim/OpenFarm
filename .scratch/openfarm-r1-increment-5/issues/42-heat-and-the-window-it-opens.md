# 42 — Heat, and the window it opens

**What to build:** Somebody on the heat-watch round sees a cow bulling and records it. That is a Heat, and it starts the clock: the farm raises the AI work for her, due between twelve and eighteen hours later, because that is the window in which a service takes. The window is a Farm Parameter, not a rule hidden in the code.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 5, user story 66; [Breeding and reproduction](../../openfarm-release-1/issues/11-breeding-and-reproduction.md) (step 1); `CONTEXT.md` — **Heat**, **Observation**.

- [ ] A Heat is an Observation of oestrus, recorded by the Step that saw it, and the glossary's existing words are used rather than new ones
- [ ] Recording one raises the AI work for that cow, due at the start of the window and overdue at the end of it
- [ ] The window is a Farm Parameter with the decided defaults (12 h and 18 h), Manager-editable
- [ ] A second Heat for a cow whose AI work is already open does not raise a second piece of work
- [ ] Her page shows her Heats, and the work each one raised
- [ ] Tests cover a Heat raising the work, the window's two ends, a repeat Heat raising nothing, and Barn Staff being able to record one in their own pens
