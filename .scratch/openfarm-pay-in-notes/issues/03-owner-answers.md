# 03 — The Owner answers it

**What to build:** Where the Owner sees the notes waiting, and the two answers — recording the capital from one, or
saying it was not found.

**Blocked by:** 02

- [ ] **Where they wait:** the Venture page's Investors tab, beside each Agreement ("৳50,000 said sent on 3 Oct, by
      bKash, TrxID …"), and a count on the Investors page and the Owner's home while any wait. The notice links to the
      Agreement's row.
- [ ] **Received:** opens the existing **Take capital** sheet filled from the note — amount, the day, the reference —
      for the Owner to check against the statement and change if the bank says otherwise. `takeCapital` takes an
      optional `payInNoteId` and, in the same transaction, marks the note received and links the movement. Every
      guard `takeCapital` has today stands; nothing is recorded on the note alone. The way is said on the movement's
      reference (bKash TrxID), the movement itself is by bank.
- [ ] **Not found:** with a line to the Investor ("not in the account by 5 Oct — please send me the slip"), required.
      The Investor may send a fresh note.
- [ ] **Closes by itself**, kept: when the Venture stops taking capital (selling starts, called off, settled), and
      when nothing is owed on the Agreement any more. Said to the Investor as closed, not as not found.
- [ ] **The photo** opens full size for the Owner; opening it is audited as an Export, as an Investor's paper is.
- [ ] **Owner only:** a Manager sees neither the notes nor the count (`OWNER_ONLY`, personal session).
- [ ] **Tests:** received closes the note and records exactly one movement; a guard `takeCapital` refuses leaves the
      note waiting; not found needs its line; closing by itself on selling and on paid in full.
