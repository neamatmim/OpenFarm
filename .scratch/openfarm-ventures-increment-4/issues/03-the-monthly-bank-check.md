# 03 — The monthly bank check

**What to build:** Once a month the Owner reads the Venture Account's real balance off the bank's own statement and records it. The farm says at once whether that agrees with what it thinks the account should hold, and by how much if it does not.

A mistake caught in weeks is a mistake somebody can still remember; the same mistake found at settlement is a figure nobody can unpick with Investors waiting. A month that disagrees stays on the record as disagreeing — it is not something to be quietly overwritten — and a Settlement will later refuse to close over one.

**Blocked by:** None — can start immediately.

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 4, user story 25, and story 62's list of what blocks a Settlement; `CONTEXT.md` — **Venture Account**, **Venture Movement**, **Settlement**.

- [x] The Owner records what the Venture Account really held at a month's end, for one Venture
- [x] The farm says what it thinks the account should hold, and the difference, at the moment she records it
- [x] A month that disagrees is kept as disagreeing, with what was read and what was expected, and the Owner may record what she found out about it rather than deleting it
- [x] One check per Venture per month, and a later one puts the same month right rather than adding a second
- [x] A Venture shows whether its last check agreed, so the Owner can see at a glance which accounts are straight
- [x] The Owner's alone, audited, from her own phone
- [x] Tests cover a check that agrees, one that does not and by how much, a month recorded twice, and a Role that may not

## What was built

- The farm says what it thinks a Venture Account held **at that month's end** — not what it holds today,
  which is a different figure and would make every check disagree by whatever arrived since.
- The Owner types what the statement said; the difference appears as she types, rounded the way the farm
  rounds so the sheet and the server cannot say different things.
- A month that disagreed comes right only when she says what she found out at that moment. She may put a
  misread figure right; she may not make a problem stop existing by typing over it.
- One record per Venture per month, with an id made of the Farm, the Venture and the month, so two
  readings cannot race into two rows.
- The card says one of three things, because two of them were previously the same: straight to a month,
  out for these months, or never checked at all — which is the one worth acting on.

## What the reviews caught

- **I repeated the mistake I had just fixed.** The bank standing was a defaulted parameter, three
  callers forgot it, and every Venture in the audit trail read "never checked" — against a rule written
  three lines above it in the same file. Required now.
- **Re-reading a month erased what she had found out about it**, because the note was overwritten with
  nothing.
- **Only the last month checked was reported**, so an August that agreed hid a July that did not — and
  the Settlement is owed the whole answer, not the most recent one. Every month still out is now named.
- The whole act ran outside the lock its neighbours take, and an interleaved pair would have written a
  trail entry pointing at a row that did not exist.
- A month before the Venture opened read straight against nothing; an overdrawn statement could not be
  recorded at all; and the sheet kept the previous Venture's figure in the box when reopened.

## Left standing

- **Nothing recomputes a check.** A movement back-dated into a checked month leaves the Venture saying
  the month agreed against a figure the farm no longer believes. Worth a ticket, and worth settling
  before the Settlement reads these.
