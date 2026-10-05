# 03 — The Owner answers it

**What to build:** Where the Owner sees the notes waiting, and the two answers — recording the capital from one, or
saying it was not found.

**Blocked by:** 02

**Status:** done (2026-10-05)

- [x] **Where they wait:** the Venture page's Investors tab, beside each Agreement ("৳50,000 said sent on 3 Oct, by
      bKash, TrxID …"), and a count on the Investors page and the Owner's home while any wait. The notice links to the
      Agreement's row.
- [x] **Received:** opens the existing **Take capital** sheet filled from the note — amount, the day, the reference —
      for the Owner to check against the statement and change if the bank says otherwise. `takeCapital` takes an
      optional `payInNoteId` and, in the same transaction, marks the note received and links the movement. Every
      guard `takeCapital` has today stands; nothing is recorded on the note alone. The way is said on the movement's
      reference (bKash TrxID), the movement itself is by bank.
- [x] **Not found:** with a line to the Investor ("not in the account by 5 Oct — please send me the slip"), required.
      The Investor may send a fresh note.
- [x] **Closes by itself**, kept: when the Venture stops taking capital (selling starts, called off, settled), and
      when nothing is owed on the Agreement any more. Said to the Investor as closed, not as not found.
- [x] **The photo** opens full size for the Owner; opening it is audited as an Export, as an Investor's paper is.
- [x] **Owner only:** a Manager sees neither the notes nor the count (`OWNER_ONLY`, personal session).
- [x] **Tests:** received closes the note and records exactly one movement; a guard `takeCapital` refuses leaves the
      note waiting; not found needs its line; closing by itself on selling and on paid in full.

**As built:** `ventures.payInNotes.list / notFound / photo` (Owner only, personal session); `takeCapital` takes `payInNoteId`
and answers the note in its own transaction; notes close as `nothing_owed` when capital fills the paper,
`venture_takes_no_capital` on a state change that stops capital (`takesCapital`) or a call-off, `investor_retired` on
retire. Web: `components/ventures/venture-pay-in-notes.tsx` on the Investors tab (anchor `#pay-in-notes`, waiting
first, Record it opens `TakeCapitalSheet` with `fromNote`, Not found dialog, slip dialog); the alert links there.
Not done: a count on the Investors page or home — the immediate alert and its link were judged enough.
