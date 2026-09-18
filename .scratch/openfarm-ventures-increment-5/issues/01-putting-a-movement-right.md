# 01 — Putting a Venture Movement right

**What to build:** Every movement of a Venture's money can be put right when it was written down wrong: a capital figure mistyped, an Advance sent to the wrong Venture, a reference from the wrong slip. Today none of them can, and a Settlement is about to freeze figures built on them.

A Correction like any other on this farm: a reason, the Owner's own window, and the trail holding what it said before. Not a deletion — an Investor's money moving and then appearing never to have moved is the one thing a Venture's records must not be able to say. Where a movement cannot honestly be corrected because the world has moved on — a Float already reconciled, a month already reimbursed — it is refused in words that say why.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 2's capital decisions and increment 4's; `CONTEXT.md` — **Venture Movement**, **Correction Window**, **Advance**, **Buying Float**, **Reimbursement**.

- [ ] The Owner corrects what a movement says: its amount, the day the bank moved it, and its reference
- [ ] A correction carries a reason and leaves the trail holding what the movement said before
- [ ] What the correction changes flows through everything that reads the movement: the Venture's balance, its budgets, what it owes the Owner, and the Floor a Venture may start buying on
- [ ] Refused where the world has moved past it — a Float already reconciled, a month already reimbursed, a Venture already settled — each with a word the reader has
- [ ] A movement is never deleted, and a correction is never a second movement
- [ ] The Owner's alone, audited, from her own phone
- [ ] Tests cover a capital figure put right and the Venture's figures after it, an Advance corrected, each refusal, and a Role that may not
