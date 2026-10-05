# 02 — An Investor sends a Pay-in Note

**What to build:** The table, the domain rules and the portal procedures for an Investor to send, change and withdraw
a Pay-in Note, and the immediate notice that tells the Owner.

**Blocked by:** 01

**Status:** done (2026-10-05)

- [x] **Table `pay_in_note`:** id, farm, agreement, amount, `sent_on` (farm day), `way` (enum: `bank_transfer`,
      `cheque`, `deposit_slip`, `mobile_money` — a new enum word needs a migration), reference (1–120), photo
      (content type + base64, nullable, as `agreement_paper`), sent at / by the Investor's account, and the answer:
      `answer` (`received` / `not_found` / closed by itself), answered at / by, the Owner's line, and the Venture
      Movement it became (FK to `venture_movement`, nullable). Every change kept in `pay_in_note_change`, as
      `request_to_join_change`, so "I said ৳50,000, not ৳5,000" has an answer.
- [x] **Portal procedures** (`investorProcedure`): `payInNotes` (theirs, by Agreement, newest first), `sendPayInNote`,
      `changePayInNote`, `withdrawPayInNote` — changed or withdrawn only until the Owner answers.
- [x] **Refused** (each a refusal code worded in both languages): - the switch is off; the portal is shut; the Investor is retired; - the Agreement is not theirs, or has no stamped paper on file (no capital without it, so no note either); - the Venture does not take capital now (`takesCapital`: open, or by the month while buying/fattening); - more than is still owed, counting notes still waiting: what `capitalItMayHold` allows, less what is
      recorded, less notes not yet answered — so two notes never promise more than the paper; - a day in the future, or before the Agreement was signed; - a photo over the size cap, or not an image.
- [x] **Notice `pay_in_note_sent`:** **immediate** (pushed), Owner only, about the note's id, with FILLINGS in
      `domain/notice-words.ts` (Investor, Venture, amount, day — Bangla numerals in the Bangla words). A change
      updates it; a withdrawal closes it, as `join_requested` follows its Request.
- [x] **Audited:** sending, changing and withdrawing are Audit Events by the Investor; the photo as an upload.
- [x] **Tests**, each proved by switching its guard off: the over-owed count with a waiting note; not theirs; no
      paper; switch off; a Manager is not told; one notice per note, not per change.

**Watch:** two portal tests pin a whole offer with `toEqual` — a new field there goes in both. `portalPreview` is the
Owner's twin of the portal; the notes it shows are the Investor's, read-only.

**As built:** tables `pay_in_note`, `pay_in_note_change`, `pay_in_note_photo` (photo kept apart so lists never carry it) in
`schema/venture-account.ts`, migration `20261005124334_pay_in_notes` with the `_known`/`_not_negative` checks by hand
and both `alert_kind_known` and `text_message_kind_known` widened. Domain `pay-in-notes.ts` (`roomForANote`,
`isWaitingNote`, the lists, mirrored and held together by a test). `api/src/pay-in-notes.ts`: send, change, withdraw,
`closePayInNotes`, the Notice (`pay_in_note_sent`, immediate, Owner only, pushed after the write). The sent day is not
refused for being before the stamped day — only for being ahead. `portal.venture` carries `payIn { mayTell, notes }`.

Found on opening the page: a Venture with no Venture Account written offered "I have sent money" right under the
warning never to pay anywhere the page does not show. A note now needs the account written (`venture_has_no_account`,
and `mayTell` false), proved red with the check off.
