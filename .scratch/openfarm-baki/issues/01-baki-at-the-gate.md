# 01 — Baki at the gate

**What to build:** When a bull or a Dispatch of milk leaves and the buyer pays less than the price, the Manager
writes what he paid and the day he promised to pay the rest. The Money Event is only what was paid. A Venture's
animal is refused unless paid in full. The Receipt says what is still owed.

**Blocked by:** —

**Status:** done

- [x] **Glossary:** **Baki**, **Baki Payment**, **Write-off** go into `CONTEXT.md` under Money, as the README words
      them. The Money Event entry gains "a Sale or a Dispatch makes one for what was paid when it left".
- [x] **Schema:** `sale.baki_bdt` and `dispatch.baki_bdt` (taka, not null, default 0: what was left owing when it
      left), `sale.promised_by` and `dispatch.promised_by` (a farm day as text, "YYYY-MM-DD", null — as
      `internal_sale.sold_on` keeps its day). Every existing row is 0 and null: all paid.
      Migration applied to both dev databases; LATEST_MIGRATION moved (see the migrate-on-merge routine).
- [x] **`sale.record`** takes `paidNowBdt` (optional, defaults to the price) and `promisedBy`. Refused: paid more
      than the price; anything owing with no promised day; a promised day before the day she left. Paid nothing:
      no Money Event is booked and no payment method is asked. `bookSaleMoney` books `price − baki`.
- [x] **A Venture's animal leaves paid in full.** `sale.record` (and any other route that writes a Sale, e.g. a
      Selling Trip, if one does) refuses a Venture's animal with anything owing: refusal `venture_paid_in_full`,
      with words in both languages that say why ("a Venture's money is never lent"). `bookSaleProceeds` is
      unchanged.
- [x] **`milk.dispatch`** (the Dispatch record) takes `paidNowBdt` and an optional `promisedBy`, with the same
      refusals less the required promise. `bookDispatchMoney` books `litres × price − baki`.
- [x] **Corrections** of a Sale and a Dispatch (`corrections/sale.ts`, the Dispatch's) can put the paid part and
      the promised day right, and the Money Event with them. A Correction that turns a Venture's Sale into Baki is
      refused the same way.
- [x] **Sheets:** the Sale sheet and the Dispatch sheet get "Paid now" (filled with the price) and, when it is less,
      "Still owes ৳…" and "Promised to pay by". The payment method is asked only for what was paid.
- [x] **Receipt** (`papers.receipt`): each animal's price, the day's total, paid, still owed, the promised day, and a
      line for the buyer to sign, since a signed paper is what the Owner can hold a trader to.
- [x] **Animal page:** a sold animal on Baki says "Sold for ৳…, ৳… still owed, promised by …".
- [x] **Tests:** paid now books only that; paid nothing books nothing; the three refusals; a Correction moving the
      paid part moves the Money Event and adds none; a Dispatch's money is `litres × price − baki`.
- [x] **Prove the Venture refusal by switching it off:** the test goes red.
- [x] **Seed:** one Farm bull sold at Eid with ৳20,000 owing and a promise a week later; one milk buyer's last few
      Dispatches on Baki with no promise.
- [x] **Somebody opens it:** the Sale sheet (a Farm bull and a Venture bull), the Dispatch sheet, the Receipt and the
      Money register, in both languages.

**Built (2026-09-29):**

- The rule lives in `packages/domain/src/baki.ts` (`bakiAtTheGate`, `bakiPutRight`, `paidAtTheGate`). A Correction
  keeps what was paid: a buyer who paid in full stays paid in full at a corrected price, and one who paid part keeps
  what he paid and owes the difference. Saying what he paid overrides that.
- The Venture refusal sits in `bookSaleMoney`, which every way of writing or putting right a Sale goes through,
  including an Intake Correction that makes a sold bull a Venture's after the fact. Proved by switching it off: three
  tests went red.
- No Selling Trip route writes a Sale; Sales are recorded one by one on `sale.record`.
- A milk Dispatch's list row and a Sale's row and page say "৳… still owed, promised by …"; the Receipt says Paid,
  Still owed and To be paid by above the buyer's signature, with the tags beside each day when he promised two.
- Seed: two of the four seed bulls sold on Baki (one promise already past, one ahead); the sweet shop's last ten days
  of milk taken on Baki with no promise.
- Opened on the seed farm (2026-09-29), Bangla and English: the Sale sheet, the day's sales list, the Correction
  dialog, the Receipt, the milk list and the animal page. Opening it found one defect, fixed before merge: the Sale
  page's "Taken today" added up prices, so a buyer who left owing read as money taken. It now adds what was paid and
  says what is still owed beneath.
