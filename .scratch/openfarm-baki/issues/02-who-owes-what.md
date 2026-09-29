# 02 — Who owes what, and Baki Payments

**What to build:** The Money page gets a Baki tab: every buyer who owes the farm, how much, since when, and the day he
promised. The Manager records a buyer's payment in one step. It clears his oldest Baki first and makes one Money Event
on the day it came. When a buyer is picked on the Sale or Dispatch sheet, what he still owes is shown.

**Blocked by:** 01

**Status:** done

- [x] **Schema:** `baki_payment` (id, farm, counterparty, `kind` milk | cattle, amount, paid on, payment method,
      note, recorded by/role/at). No allocation table: which Baki a payment cleared is worked on read, so a
      Correction to an old Sale or payment re-flows without rewriting history.
- [x] **Money:** a new record source `baki_payment`. It books under the Category of what it paid for, the Dispatch's
      (milk sales) or the Sale's (cattle sales), not a Category of its own, so totals by Category are unchanged. Say
      in `money.ts` where the source → Category rule now has this one exception, and why. The Approval Threshold
      applies as for any money the Owner did not enter.
- [x] **Domain `baki.ts`** (pure): given a buyer's Baki items (Sales and Dispatches with `baki_bdt`, day, promise)
      and his payments of that kind, each item's paid and still owing, oldest first; a buyer paid ahead holds what
      is over as credit, shown and cleared by his next Baki. Tests: part-payment, one payment clearing several, the
      same-day tie (tie-break on id), paid ahead, a Correction shrinking an old Baki below what was paid on it.
- [x] **API** (Owner and Manager, as the Money page is):
  - `baki.list`: by buyer, with total owing, oldest day, earliest promise and phone, and each item and payment.
  - `baki.ofBuyer({ name })`: his milk and cattle owing, for the sheets.
  - `baki.pay`: audited. More than he owes is taken only with a note, and the rest is held as his credit.
  - `baki.correctPayment`: the Correction Window as for money entries.
- [x] **Web:**
  - **Money → Baki tab:** buyer rows, oldest first, with `tel:` on the phone. A row opens his items and payments.
    "Record a payment" opens with the buyer and the kind filled in.
  - **Sale and Dispatch sheets:** "Karim still owes ৳45,000 since 12 Aug" when he is picked.
  - **Animal page:** her Baki as paid down.
- [x] **Accountant export:** Baki Payments come through as Money Events already. Add a "Baki at month end" sheet (who
      owed what on the month's last day), so the accountant sees what is outstanding.
- [x] **Seed:** the Eid trader pays half; the milk buyer pays a round sum covering several Dispatches.
- [x] **Somebody opens it:** the Baki tab as Owner and Manager, a payment recorded, the sheets' warning, the Money
      register showing one line for the handover, in both languages.

**Built (2026-09-29):**

- Domain `bakiStanding` clears oldest first, payment by payment, and says which payment cleared what (`parts`);
  what is left of a payment is credit, spent by the next Baki. Same-day ties go by id.
- `baki_payment` is a money source outside `RECORD_SOURCES`: `MoneyOfARecord.categoryKey` names the Category it books
  under (`CATEGORY_OF_BAKI`: milk → `dispatch`, cattle → `sale`).
- `baki.list`, `baki.ofBuyer`, `baki.pay` (personal session; locks the buyer's row while his Baki is read),
  `baki.correctPayment` (amount, day, method, note — not who or what for).
- The day's sales, the milk list and the animal page now say what is still owed **today** (`owingNowOf`), not what was
  owed at the gate; the Sale page's hint too. Found while building, not in the ticket.
- The accountant's paper gains "Owed to the farm at the period's end", read as at the period's last day. Its
  "বাকি / Net" line is now "নিট / Net", since বাকি now means what a buyer owes.
- Export: a cattle payment's reference is the tags it cleared, its Sides split by what it paid of each; milk is the
  Dairy side's.
- Proved by switching off: the paid-more-than-owed guard.
- Opened on the seed farm (2026-09-29): the Baki tab (three buyers, ৳43,340), a payment recorded through the sheet
  (total fell to ৳39,340), the Sale sheet warning for the trader (৳6,000 since 20 September), and the register
  showing the payments under Cattle sales and Milk sales.
