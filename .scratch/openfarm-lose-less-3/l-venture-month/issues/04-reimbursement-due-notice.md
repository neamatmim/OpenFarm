# 04 — The Owner is told a month's Reimbursement is due

**What to build:** From the first of each month, the Owner's Digest says, for each running Venture whose month just
over comes to more than nothing — its own figure and its carried lines — and has not been reimbursed, that its
Reimbursement is due and how much. Once per Venture per month.

**Blocked by:** 02

**Status:** open.

- [ ] **Glossary:** **Reimbursement** — "the Owner is told in the Digest when one is due". **Notice** unchanged: a new
      kind is one more line in the delivery table, as the entry says.
- [ ] **Schema:** `reimbursement_due` added to `ALERT_KINDS` (`db/schema/alert-kinds.ts`) — a text enum, so no
      migration.
- [ ] **Facts and words:** `reimbursement_due: { ventureId; venture; month; owedBdt }` in `domain/notice-facts.ts`; the
      month said in Bangla where it is built, as `investor_statement_due` does (`investor-statement-notice.ts:61-64`);
      its filling in `FILLINGS` (`domain/notice-words.ts:65`); the Digest and in-app keys in `domain/notify.ts`; the
      audience the Owner alone and entity `venture` in `api/notice.ts`, beside `investor_statement_due`.
- [ ] **Rule:** a sweep in `theSweep` (`the-day-turns.ts:632`), shaped as `papersToTell` / `tellAboutPapersDue`: asked
      before any transaction, Ventures Buying, Fattening or Selling, the month just over not reimbursed and its total
      (02's function) more than nothing; composite id `${ventureId}:${month}` so the unique index stops a second
      telling. Not raised for a Venture whose Settlement is approved.
- [ ] **Refusal words:** none.
- [ ] **Screen:** the notice list and the Digest say "‹Venture›: ‹মাস›-এর খরচ ফেরত দেওয়ার সময় হয়েছে — ৳…"; tapping it
      opens the Venture with the Reimburse sheet on that month.
- [ ] **Tests** (`the-day-turns.test.ts`, or a new `routers/reimbursement-due.test.ts`):
  - **First, red before the fix:** a Venture whose animals ate in March; the sweep on 1 April raises nothing today;
    now one `reimbursement_due` for March with its taka, to the Owner and not the Manager.
  - Not raised for a month already reimbursed, nor for one that came to nothing, nor twice on a second sweep.
  - A carried line alone makes the month due.
  - **Proved by switching off** the already-reimbursed filter, and the once-per-month id: each red.
- [ ] **Somebody opens it** (seed): the clock moved to the first of next month and the sweep run; the Owner's notice
      list carries the month's Reimbursement due for each seed Venture with animals, in Bangla, and tapping it opens
      the sheet on that month.
