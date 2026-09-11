# 31 — Death and Cull

**What to build:** The Manager records that an animal died or was culled: when, the cause as far as the farm knows it, and how the carcass was disposed of. She leaves the herd — off the pen boards, out of the day's work, out of the headcounts — and everything recorded about her stays exactly where it is. Disposal is evidence: the burial rule exists and an inspector may ask.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 3, user story 57.

- [ ] The Manager records a Death or a Cull with its cause and disposal method; Staff cannot
- [ ] The animal leaves the herd everywhere at once, and her history is untouched
- [ ] A mortality shows on her page and counts towards what the farm reports
- [ ] Recording one is an Audit Event like any other, and correcting it is a Correction
- [ ] Tests cover a death, a cull, the animal leaving the day's work, and Staff being refused
