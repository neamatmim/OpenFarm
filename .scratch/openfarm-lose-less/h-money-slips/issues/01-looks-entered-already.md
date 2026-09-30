# 01 — Looks entered already

**What to build:** Entering money by hand that matches an earlier entry — same person, amount and farm day — is
refused `looks_entered_already` with the match (amount, person, day, who entered it) unless sent again with
`sameAgain`; one saved again is told to the Owner.

**Blocked by:** —

**Status:** done, 2026-10-01.

- [x] **Glossary:** new **Entered Twice** ("Duplicate" avoided: it may be two real bills).
- [x] **Rule:** domain `looksEnteredAlready` — the same person (NFC, trimmed, case-folded), the same taka, the same
      farm day, any Category; money that named nobody never matches. In `enter`, before booking, against the day's
      by-hand Money Events (`askIfEnteredAlready`); a wage (with its month) is not asked — one wage a month already
      refuses it.
- [x] **Confirm:** refused `looks_entered_already` with `match` (id, name, taka, day, Category, who entered it); the
      entry sheet shows it in a `ConfirmDialog` — "রফিকুল ইসলাম ১ অক্টোবর… আগেই লিখেছেন, মেরামত খাতে" — and "আবার
      রাখুন" resends with `sameAgain: true`. The trail's `after` carries `enteredKnowing` (the earlier id).
- [x] **Told:** `entered_twice`, digest to the Owner, about the second entry; not raised when the Owner entered it
      twice. The notice opens the money page. New relation `moneyEvent.recorder`.
- [x] **Tests:** `routers/looks-entered-already.test.ts` (5) and domain `looks-entered-already.test.ts` (4). **Proved by
      switching off** the refusal, the telling, the Owner's quiet and the case-folding — each red; the trail's
      `enteredKnowing` likewise. `corrections/correction.test.ts` gave each fixture entry its own mistri: it made the
      same repair on the same day in every test.
- [x] **Somebody opens it** (seed, 2026-10-01, as the Manager): ৳1,800 repairs to "হাবিব মিস্ত্রি (সিড দেখা)" entered,
      then again from the sheet: the dialog named the earlier entry and said the Owner would hear of it; saved again,
      both kept and মোঃ আব্দুল করিম was told.

**Not built:** the same bill entered under two different names ("Habib" and "হাবিব") is not caught; nor money a record
books (a Sale, an Intake), whose own records refuse doubles.
