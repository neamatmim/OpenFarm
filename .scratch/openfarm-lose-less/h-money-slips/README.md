# H — Money slips

Survey "smaller or waiting" items (`../survey.md`), chosen by the Owner 2026-09-30.

**What the app already does** (read from the code, 2026-09-30):

- Money entered by hand (`routers/money-entries.ts:351-435`) is checked for its Category, a day not yet come, and one
  wage a person a month (`assertWageNotYetEntered`, `money-by-hand-store.ts:91-117`, a hard refusal backed by a unique
  index). **Nothing notices the same bill entered twice.** `bookMoney` matches rows only by (source, sourceId).
- The **Approval Threshold** (`farm.approvalThresholdBdt`, ৳20,000) is compared with one Money Event at a time
  (`approvalOf`, `domain/money.ts:32-51`; `money-store.ts:623-628`). **Nothing adds pieces up**: ৳60,000 of bamboo
  entered as four ৳15,000 bills never waits for the Owner.
- The Owner's queue (`routers/home.ts:350-366`, `home/owner-queue.tsx`) lists what waits; it does not show who
  entered it. There is no reject, only approve.
- No confirm-anyway step exists anywhere; `ConfirmDialog` (`page-kit.tsx:600`) is there to use. The tell-the-Owner
  pattern is `feed_price_jump` (digest).
- A person is matched by exact name (`counterpartyNamed`): "Rahim" and "rahim" are two people.

| #   | Ticket                               | Blocked by |
| --- | ------------------------------------ | ---------- |
| 01  | Looks entered already                | —          |
| 02  | Pieces that add up past the line     | —          |

**Settled with the Owner, 2026-09-30, and not to be re-asked:**

- **A likely duplicate is warned, and the Owner told** (H1): the Manager sees the earlier entry and confirms to save it
  again; a confirmed one reaches the Owner in the evening post.
- **Pieces past the line wait for the Owner** (H2): when one person's pieces entered in 7 days by anyone but the Owner
  add up past the line, the piece that crosses it waits for approval, and the queue shows the pieces together.

**Settled in drafting** (the Owner may overrule):

- "The same": the same person, the same amount, the same farm day, money entered by hand (any Category). Money a record
  books (a Sale, an Intake) is left out: the record itself refuses doubles.
- The person is matched case-folded for this check, not only exactly.
- Pieces: money entered by hand to one person, the 7 farm days up to and including this one; earlier pieces stay as
  they were; the Owner's own entries never count.
- No reject action is added here.
