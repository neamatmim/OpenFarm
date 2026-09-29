# 02 — Who owes what, and Baki Payments

**What to build:** The Money page gets a Baki tab: every buyer who owes the farm, how much, since when, and the day he
promised. The Manager records a buyer's payment in one step. It clears his oldest Baki first and makes one Money Event
on the day it came. When a buyer is picked on the Sale or Dispatch sheet, what he still owes is shown.

**Blocked by:** 01

**Status:** not started

- [ ] **Schema:** `baki_payment` (id, farm, counterparty, `kind` milk | cattle, amount, paid on, payment method,
      note, recorded by/role/at). No allocation table: which Baki a payment cleared is worked on read, so a
      Correction to an old Sale or payment re-flows without rewriting history.
- [ ] **Money:** a new record source `baki_payment`. It books under the Category of what it paid for, the Dispatch's
      (milk sales) or the Sale's (cattle sales), not a Category of its own, so totals by Category are unchanged. Say
      in `money.ts` where the source → Category rule now has this one exception, and why. The Approval Threshold
      applies as for any money the Owner did not enter.
- [ ] **Domain `baki.ts`** (pure): given a buyer's Baki items (Sales and Dispatches with `baki_bdt`, day, promise)
      and his payments of that kind, each item's paid and still owing, oldest first; a buyer paid ahead holds what
      is over as credit, shown and cleared by his next Baki. Tests: part-payment, one payment clearing several, the
      same-day tie (tie-break on id), paid ahead, a Correction shrinking an old Baki below what was paid on it.
- [ ] **API** (Owner and Manager, as the Money page is):
  - `baki.list`: by buyer, with total owing, oldest day, earliest promise and phone, and each item and payment.
  - `baki.ofBuyer({ name })`: his milk and cattle owing, for the sheets.
  - `baki.pay`: audited. More than he owes is taken only with a note, and the rest is held as his credit.
  - `baki.correctPayment`: the Correction Window as for money entries.
- [ ] **Web:**
  - **Money → Baki tab:** buyer rows, oldest first, with `tel:` on the phone. A row opens his items and payments.
    "Record a payment" opens with the buyer and the kind filled in.
  - **Sale and Dispatch sheets:** "Karim still owes ৳45,000 since 12 Aug" when he is picked.
  - **Animal page:** her Baki as paid down.
- [ ] **Accountant export:** Baki Payments come through as Money Events already. Add a "Baki at month end" sheet (who
      owed what on the month's last day), so the accountant sees what is outstanding.
- [ ] **Seed:** the Eid trader pays half; the milk buyer pays a round sum covering several Dispatches.
- [ ] **Somebody opens it:** the Baki tab as Owner and Manager, a payment recorded, the sheets' warning, the Money
      register showing one line for the handover, in both languages.
