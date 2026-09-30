# 02 — Pieces that add up past the line

**What to build:** When money entered by hand to one person by anyone but the Owner, over the 7 farm days up to this
entry, adds up past the Approval Threshold, the entry that crosses it waits for the Owner's approval even though it is
under the line alone; the Owner's queue shows it with its pieces.

**Blocked by:** —

- [ ] **Glossary:** widen **Approval Threshold** (pieces to one person in 7 days).
- [ ] **Rule:** in `approvalOf` or beside it — a piece that crosses → `awaiting`; a Correction re-asks the same way.
- [ ] **Screen:** the queue row says why it waits ("৳… to X in 7 days") and who entered it.
- [ ] **Tests:** three pieces under the line pass, the fourth crossing waits; the Owner's own pieces never count; 8
      days apart do not add.
