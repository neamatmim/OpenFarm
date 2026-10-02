# 04 — The monthly check of a Farm Account

**What to build:** Each month the Owner reads each Farm Account's statement — the bank's, or bKash's — against what the
farm believes it held at that month's end: the **Bank Check**, widened from the Venture Account to the Farm's own. A
month that disagrees stays disagreeing until she says what she found out; one the farm has changed its mind about goes
stale.

**Blocked by:** 03

**Status:** done (2026-10-03).

**As built:** the standing rule moved out of `venture-store.ts` into `bank-standing.ts` (`standingOf`), which both
`bankStandingOf` and `farmAccountStandingOf` (`farm-account-store.ts`) read. The check is `farmAccounts.check` and
`farmAccounts.expectedAtMonthEnd`; the trail is the Owner's, beside `venture_bank_check`. The Owner's home names an
account month out under Money. The seed pays its feed lorries by bank or cash rather than bKash, and moves ৳55,000 from
the bank account to the office bKash each payday — before, the number would have read ৳5.7 lakh overdrawn.

- [x] **Glossary:** **Bank Check** widened — of a Venture Account or a Farm Account; a Farm Account's first reading is
      what it held from then on; only a Venture's blocks a Settlement. **Farm Account** says it is read monthly.
- [x] **Schema:** `farm_account_check` (the account, the month, what the statement read, what the farm believed, the
      note, who and when; one per account per month), the pair of `venture_bank_check` (`db/schema/venture.ts:755`).
      Migration `a_farm_account_read_each_month`, both dev databases.
- [x] **Rule:** what the farm believes a Farm Account held at a month's end: its first reading, plus every Money
      Event naming it (in less out) and every Handover into or out of it, after that month. `farm.accounts.check`, the
      Owner's alone and from her own session: `month_not_over` and `say_what_you_found_out` as `checkTheBank`
      (`routers/ventures.ts:3076-3200`); a month before the first reading refused (`before_the_first_reading`). Stale
      and disagreed told apart by the same rule as `bankStandingOf` (`venture-store.ts:986-1058`) — the standing worked
      out once over a list of checks and the months as believed now, and both kinds of account read through it, not a
      second copy.
- [x] **Words:** `before_the_first_reading` in `apps/web/src/lib/correction-refusal.ts`, Bangla and English.
- [x] **Screen:** each Farm Account in the list says what the farm believes it holds now, the last month read and the
      months out (disagreed, stale); the Check sheet is `bank-check-sheet.tsx` reused. The Owner's home names a Farm
      Account month that disagrees or went stale.
- [x] **Tests:** `routers/farm-account-check.test.ts`. **The complaint first:** ৳5,000 of manure sold for cash and
      written as bKash with a made-up TrxID — the bKash number's month disagrees by ৳5,000 against a statement that never
      had it. Then: the first reading takes the statement; the next month agrees with what named it; a disagreeing month
      will not come right without a word; a Correction into a read month makes it stale; a month not over, or before
      the first reading, refused; `bank-check.test.ts` still green. **Proved by switching off** the word required, the
      stale rule and the first-reading refusal — each red.
- [x] **Somebody opens it** (seed): the Owner reads September's bKash statement, one figure off, writes what she found
      out; the account's line and her home say so until it agrees.
