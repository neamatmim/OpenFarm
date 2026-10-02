# 02 — Whose hand took the notes

**What to build:** A cash Sale or Baki Payment names whose hand took the notes. It is the person writing it unless
the Owner names another: the Owner writing up the Manager's haat sale puts the cash in the Manager's hand, where his
Friday count will look for it.

**Blocked by:** —

**Status:** done, 2026-10-02.

- [x] **Glossary:** **Money Event** widened — a cash one names the hand the record says, the writer's unless the
      Owner names another Owner or Manager. **Cash in Hand** unchanged.
- [x] **Schema:** none: `money_event.held_by` is there, and `MoneyOfARecord.heldBy` (`money-store.ts:330-331`) is
      already read by `handOf`.
- [x] **Rule:** `sale.record` and `baki.pay` take whose hand, passed to `bookMoney` as `heldBy`; the Owner may name
      any Owner or Manager, a Manager only their own (`owner_only`, as `cash.handOver`'s `NOT_YOURS`); the hand must
      hold the farm's cash (`holds_no_cash`, reused); bKash and the bank still name nobody whatever is sent. Their
      Corrections (`corrections/sale.ts`, `corrections/baki-payment.ts`) may put the hand right on the same rule. A
      Venture's held sale cash (01) follows the hand named.
- [x] **Words:** none new — `owner_only` and `holds_no_cash` are worded already.
- [x] **Screen:** the Sale and Baki Payment sheets ask "Whose hand took the cash" when cash is chosen and the writer is
      the Owner (from `cash.holders`), herself by default; a Manager sees no question. The register's "…-এর হাতে"
      names the hand chosen.
- [x] **Tests:** `routers/whose-hand.test.ts`. **First, red until the hand reaches `bookMoney`:** the Owner writes
      up a ৳80,000 cash Sale the Manager made, naming the Manager — the Manager's Cash in Hand holds it and hers does
      not (today hers). Then: a Manager naming the Owner is refused; a Vet named is refused; bKash names nobody; a Baki
      Payment the same; a Correction moves the hand. **Proved by switching off** the Manager's-own rule and the holder
      check on this path — each red.
- [x] **Somebody opens it** (seed): signed in as the Owner, a cash Sale written for the Manager shows in his hand on
      the cash tab and the register reads "…-এর হাতে" with his name.
- Done: `routers/whose-hand.test.ts` (6) — red before (the hand named was ignored: the Owner's took it, a Manager
  naming the Owner was taken); the Manager's-own rule and the holder check each switched off: red. One rule,
  `assertTheHand` in `cash-store.ts`, on `sale.record`, `baki.pay` and both Corrections (`heldBy`, shown from the
  Money Event by `handOfTheRecord`). The sheets' `WhoseHandField` (`components/whose-hand.tsx`) asks only the Owner,
  only for cash, and only where another hand holds the farm's cash; her own by default, which sends nothing. Not
  opened: the Sale sheet's field (every seed bull for sale is inside a withdrawal) — the same field, tested by type.
  Seed: a ৳1,000 Baki Payment from হাজী সিরাজুল ইসলাম written by the Owner into রফিকুল ইসলাম's hand — his hand
  ৳2,96,793 → ৳2,97,793, hers unmoved, the register "বাকি পরিশোধ · নগদ · রফিকুল ইসলাম-এর হাতে".
