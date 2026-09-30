# 02 — Pieces that add up past the line

**What to build:** When money entered by hand to one person by anyone but the Owner, over the 7 farm days up to this
entry, adds up past the Approval Threshold, the entry that crosses it waits for the Owner's approval even though it is
under the line alone; the Owner's queue shows it with its pieces.

**Blocked by:** —

**Status:** done, 2026-10-01.

- [x] **Glossary:** **Approval Threshold** widened: a bill in pieces is one bill.
- [x] **Rule:** domain `approvalOf` takes `piecesBdt`; `bookMoney` works it out (`piecesOf`): money entered by hand to
      the same Counterparty, the same direction and purse, by anybody but the Owner (`recordedByRole`), on this farm day
      or the six before, itself left out. The crossing piece and any after it wait; earlier pieces stand. A Correction
      re-asks the same way (an approved piece keeps its approval while its terms stand).
- [x] **Screen:** the Owner's queue row names who entered it ("লিখেছেন …") and, for one under the line alone, "একা সীমার
      নিচে, এই সপ্তাহে একই মানুষকে দেওয়া বাকি অংশসহ সীমার বেশি" (`inPieces`, `recordedByName` on `home.owner`).
- [x] **Tests:** `routers/pieces-past-the-line.test.ts` (4), domain `approval.test.ts` (3). **Proved by switching off**
      the pieces, the week, the Owner's exclusion, the person and the queue's flag — each red.
- [x] **Somebody opens it** (seed, 2026-10-01): as the Manager, ৳12,000 + ৳12,000 of repairs to "টিন বিক্রেতা (সিড
      দেখা)" two days apart — the first not asked, the second waiting; as the Owner, the row read as above.

**Not built:** the queue does not add the week's pieces up in taka beside the row, nor show them together; a reject.
