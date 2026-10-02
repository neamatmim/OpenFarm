# 01 — A Venture's sale cash, held until it is deposited

**What to build:** A Venture's animal sold for cash leaves her price in the hand that took it, as that Venture's money:
shown on the cash tab, counted at the Friday Cash Count, until a Handover deposits it into the Venture Account with its
slip. Only then does the Venture Account hold it, dated the day it went in.

**Blocked by:** —

**Status:** done, 2026-10-02, but for the Venture page's held lines and the Friday-count test (below).

- [x] **Glossary:** **Cash in Hand** widened — a Venture's sale cash is held in a hand until deposited ("a Venture's
      money moves through its account, never a pocket" changes); **Handover** widened — a deposit of a Venture's sale
      cash into its Venture Account; **Venture Account** — cash reaches it only by a deposit slip from the hand that held
      it; **Venture Movement** — a cash Sale's movement carries the slip and the day it went in, not her tag;
      **Cash Count** — counts a Venture's notes with the Farm's, and a difference is the Farm's; **Settlement** — not
      while a Venture's sale cash is in a hand; **Sale** — a Venture's animal is never paid by bKash.
- [x] **Schema:** `handover.venture_id` (the Venture Account a deposit went into) and `venture_movement.handover_id`
      (the deposit that carried a `sale_in`). Migration `a_ventures_sale_cash_is_held`, both dev databases. **No start
      day:** a Venture's cash Sale already carrying its `sale_in` stays as written; "held" is a cash Sale of a Venture's
      animal with no movement yet.
- [x] **Rule:** `bookSaleProceeds` (`venture-store.ts:1067`) writes nothing for a cash Sale until it is deposited, and a
      Correction to one not yet deposited moves no movement; `handsOf` (`cash-store.ts:38-85`) counts a Venture-purse
      cash Sale in its hand while it is held, so `cashInHand` and the Cash Count's expected figure both read it.
      `cash.handOver` takes a Venture's account as its `to` end with the Sales it carries: from a hand, the slip
      required (`bank_needs_a_slip`, reused), each Sale a held cash Sale of that Venture's animal in that hand
      (`not_held_here`), none deposited before (`already_deposited`); it writes their `sale_in` movements dated the
      deposit day, the slip as reference. bKash refused for a Venture's animal in `bookSaleMoney`
      (`venture_sale_not_by_bkash`), where every way a Sale is written or put right comes through. A Settlement block
      `sale_cash_in_a_hand` beside `a_float_is_open` (`settlement-store.ts:229-232`), naming the tags and the hands.
- [x] **Words:** `not_held_here`, `already_deposited`, `venture_sale_not_by_bkash` and `sale_cash_in_a_hand` in
      `apps/web/src/lib/correction-refusal.ts` (the last in `settlement-sheet.tsx` too), Bangla and English.
- [x] **Screen:** each hand on the cash tab says "of which ৳… is <Venture>'s" with the tags; a "Deposit into the
      Venture Account" act on a hand holding one (Sales ticked, slip, day); the Venture's account shows "sold, cash not
      yet deposited" for each until then. The cash list's cached answer defaults the new figure to nothing.
- [x] **Tests:** `routers/venture-sale-cash.test.ts`. **First, red before the fix:** the Manager sells a Venture's
      bull for ৳150,000 cash — the Venture Account holds nothing of it and the Manager's Cash in Hand reads ৳150,000
      (today the movement is there on the sale day and the hand reads ৳0). Then: the Friday count is compared against
      it; a deposit with the slip moves it into the Venture Account on the deposit day; the same Sale deposited again,
      or from another hand, is refused; the Settlement is blocked while it is held; a Venture's animal sold by bKash is
      refused; a price Correction before the deposit changes what the hand holds; an old Sale with its movement is not
      held. **Proved by switching off** the once-only deposit, the slip, the hand check, the bKash refusal and the
      Settlement block — each red.
- [x] **Somebody opens it** (seed): a Venture's bull sold for cash by the Manager shows in his hand as the Venture's;
      deposited with a slip, the Venture's account reads the `sale_in` dated that day; the Settlement sheet names the
      block before and not after. The seed holds one deposited and one still held.
- Done: `routers/venture-sale-cash.test.ts` (6) — red before (the `sale_in` there on the sale day, the hand at ৳0; a bKash
  sale taken); each of the once-only deposit, the slip, the hand check, the bKash refusal and the Settlement block
  switched off turned its own test red. Held is `heldSalesOf` in `cash-store.ts` (a Venture's cash Sale with no
  `sale_in`); `handsOf` adds it to the hand and leaves deposits out (their Sales stop being held as they are written);
  the deposit is `cash.handOver` with `to: { ventureId, saleIds }`, the amount theirs to the taka (`amount_changed`
  reused). The Settlement block is a guess-before-the-sum, as an open Float is. No test file had to change: every
  Venture sale in them was by bank. Migration `20261002172002_a_ventures_sale_cash_is_held`, both dev databases (167).
  **Not built:** the Venture page's "sold, cash not yet deposited" lines (the Settlement block names the tags and hands
  instead). **Not tested:** the Friday count against held cash (it reads the same `handsOf`). Seed: every seed Venture
  bull is inside a meat withdrawal, so the gate bull F-0064 was sold for cash by the Owner (৳82,000) — held in her hand
  as "মাসে মাসে ২০২৭ ভেঞ্চার"'s, the Settlement blocked; deposited through the cash tab with "জমা স্লিপ ৪৪১ (যাচাই)",
  the `sale_in` dated 2 October and the block gone. The seed holds that one deposited; none held.
