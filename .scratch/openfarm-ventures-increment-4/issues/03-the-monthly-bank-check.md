# 03 — The monthly bank check

**What to build:** Once a month the Owner reads the Venture Account's real balance off the bank's own statement and records it. The farm says at once whether that agrees with what it thinks the account should hold, and by how much if it does not.

A mistake caught in weeks is a mistake somebody can still remember; the same mistake found at settlement is a figure nobody can unpick with Investors waiting. A month that disagrees stays on the record as disagreeing — it is not something to be quietly overwritten — and a Settlement will later refuse to close over one.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 4, user story 25, and story 62's list of what blocks a Settlement; `CONTEXT.md` — **Venture Account**, **Venture Movement**, **Settlement**.

- [ ] The Owner records what the Venture Account really held at a month's end, for one Venture
- [ ] The farm says what it thinks the account should hold, and the difference, at the moment she records it
- [ ] A month that disagrees is kept as disagreeing, with what was read and what was expected, and the Owner may record what she found out about it rather than deleting it
- [ ] One check per Venture per month, and a later one puts the same month right rather than adding a second
- [ ] A Venture shows whether its last check agreed, so the Owner can see at a glance which accounts are straight
- [ ] The Owner's alone, audited, from her own phone
- [ ] Tests cover a check that agrees, one that does not and by how much, a month recorded twice, and a Role that may not
