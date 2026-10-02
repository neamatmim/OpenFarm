# 01 — A Settlement whose account does not add up waits

**What to build:** A Settlement that would leave a taka or more in the Venture Account once everybody is paid — or be a
taka or more short of paying them — is blocked, says by how much and which way on its sheet, and cannot be approved
until the Owner finds it. Paisa are swept to the Farm, as now.

**Blocked by:** —

**Status:** done, 2026-10-02.

- [x] **Glossary:** **Settlement** — "Impossible to approve while an Animal still stands, …" gains "or its account
      would be left a taka or more over or short once everybody is paid". The entry already says a taka or more "is the
      Owner's to go and find"; this is where she is told.
- [x] **Schema:** none. The figure is worked out, never stored, as every other block is.
- [x] **Rule:** `whatBlocksIt` (`settlement-store.ts:184`) is given `overBdt` (worked out at 483-489) and adds a Block
      `{ word: "the_account_does_not_add_up"; overBdt }` where `Math.abs(overBdt)` is a taka or more — the line
      `sweptUp` already draws (118-129), one constant, not a second. `approveSettlement` refuses on it as on every block.
- [x] **Refusal word:** `the_account_does_not_add_up` in `apps/web/src/lib/correction-refusal.ts`, and
      `refusal.theAccountDoesNotAddUp` in both message files; the sheet's words for the block say over or short and the
      taka, worded in Bangla where the string is built.
- [x] **Screen:** the Settlement sheet (`components/ventures/settlement-sheet.tsx`) lists it with the other blocks:
      "হিসাবের চেয়ে অ্যাকাউন্টে ৳… বেশি" / "… কম".
- [x] **Tests** (`routers/settlement.test.ts`, beside "clears every block, and then adds up exactly"):
  - **First, red before the fix:** a Venture whose month was reimbursed, then a Feeding back-dated into that month,
    every other block cleared — approved today, the account left holding the feeding; blocked
    `the_account_does_not_add_up` with the feeding's taka, and approval refused. Asserted on the block list, not on the
    first word, since 02 adds `a_reimbursement_is_owed` beside it.
  - Under a taka: swept to the Farm and approved, as today.
  - **Proved by switching off** the new block: the first test goes red.
- [x] **Somebody opens it** (seed): a Feeding of a seed Venture's pen back-dated into a reimbursed month;
      its Settlement sheet shows the account over by that feeding's taka and the approve button says why it waits.
- Done: `routers/account-adds-up.test.ts` — a Herd Cost entered after its month was reimbursed, every other block
  cleared: no block before (approvable), `the_account_does_not_add_up` ৳2,000 after; red again with the block switched
  off. **Changed from drafting:** what the account still holds for months owed is left out of the figure
  (`stillOwedBdt`) — it is the Farm's, said by its own block — so the two never say one thing twice; and the block is
  not raised while the sum is itself a guess (nobody signed, splits disagree, an Animal standing, a price missing, a
  Float out). `approveSettlement` now asks "already approved" first: after approval a late cost leaves the live sum
  not adding up, and that is an Adjustment's business. Paisa still swept — `settlement.test.ts` unchanged and green.
  Seed: ৳2,000 "পালের টুকিটাকি" dated 2026-08-15 (a reimbursed month) for "কোরবানি ২০২৬ ভেঞ্চার" — its sheet reads
  "সবাইকে দেওয়ার পরে অ্যাকাউন্টে ৳৩০৭ বেশি থাকবে"; the other three seed Ventures raise no such block.
