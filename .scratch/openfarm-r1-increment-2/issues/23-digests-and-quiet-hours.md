# 23 — Digests and quiet hours

**What to build:** The Manager's phone stays quiet unless it matters. Overdue work and the safety Alerts arrive the moment they happen; everything else waits and arrives together in a morning and an evening digest. Quiet hours hold the non-urgent ones until morning. The times are farm parameters, because a farm that milks at four is not a farm that milks at six.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 2, user story 92.

- [ ] Each Alert kind is either immediate or digestible, decided in one place and visible in the code as such
- [ ] Digest times and quiet hours are farm parameters with sensible defaults
- [ ] A digest names what is in it and links to each thing; an empty digest is not sent
- [ ] Nothing is lost to quiet hours — held, then delivered, and still in the in-app list throughout
- [ ] Tests drive the clock across a quiet period and both digest times, and assert what was pushed and when
