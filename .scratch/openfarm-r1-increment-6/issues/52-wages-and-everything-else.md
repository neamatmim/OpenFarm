# 52 — Wages, and everything else

**What to build:** What no other record catches — wages, electricity, repairs, transport, manure sold — the Manager enters by hand, with a Category, a Counterparty, how it was paid and a photo of the receipt. With this the month is complete. The farm keeps its own list of Categories.

**Blocked by:** 51

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 6, user stories 78 and 79; [Finance in Release 1](../../openfarm-release-1/issues/13-finance-in-release-1.md); `CONTEXT.md` — **Money Event**, **Category**, **Counterparty**, **Approval Threshold**.

- [x] The Manager enters an income or expense with amount, date, Category, Counterparty, payment method (cash, bKash, bank) and an optional receipt photo
- [x] Wages are one entry per person per month, naming the person as the Counterparty
- [x] The farm's Categories are a list the Owner and Manager keep, seeded with the headings the records already use; a Category in use is retired, never removed
- [x] An entry over the Approval Threshold waits for the Owner exactly as a record's Money Event does; a Correction to an entry is a Correction, with a reason
- [x] Finance is online-only, and Barn Staff never see it
- [x] Tests cover an expense and an income, a wage, a receipt photo, a new Category and a retired one, the threshold, and a correction

## What was built

**Money entered by hand.** It is a Money Event of its own, from the source `by_hand`.
- **`money.enter`** is the Manager's, from a personal phone. It takes an amount and a day that has come, plus a Category, a Counterparty and a payment method (cash unless said).
- **Optional fields:** a note, the Side it belongs to (Dairy, Fattening, or left out for the whole farm), and a receipt photo.
- **Receipts** are kept in their own table, as an Animal's photo is. `money.receipt` shows the photo to the Owner and the Manager, and the money list says which Money Events have one.

**Wages.** A wage is money under the standard Wages Category.
- It names the person as the Counterparty and the month it pays for (`YYYY-MM`).
- A second wage for the same person and month is refused (`wage_already_entered`), with a unique index behind it.
- A wage without a month is refused (`wage_needs_month`), and so is a month on anything that is not a wage (`month_is_for_wages`).

**The farm's Categories** (`money.categories`, `addCategory`, `retireCategory`; the Owner's and the Manager's).
- **Standard Categories:** every farm gets the six its records book under, plus Wages, Utilities, Repairs, Transport and Manure sales. They are added once, through an audited write that records only what it actually added.
- **The farm's own:** added with a direction. A name the farm already has, or a standard one's name, is refused.
- **Retiring:** a retired Category takes nothing new, and what was entered under it keeps it and can still be corrected. The records' Categories and Wages are never retired.
- **By hand:** money is not entered under a record's Category, except a vet's fee, which a visiting vet with no login is paid all the same.

**The threshold.** Money entered by hand over the Approval Threshold waits for the Owner exactly as a record's does.

**Corrections** (`money.correctEntered`, the Manager's) are Corrections: a reason, the Correction Window, and the trail showing the Money Event either side.
- They can change the amount, the day, the Category, the Counterparty, the payment method, the note (cleared when sent as nothing), the wage month or the Side, or add a receipt that came later.
- A record's money is refused here (`correct_the_record`).

**Web.** The Money page gains:
- the entry form, with a month field for a wage and the Side;
- the Categories list, with add and retire;
- a receipt link on each row;
- a correction form for money entered by hand: amount, note, receipt, reason.

**Six tests** in 2038:
- the standard Categories;
- an expense with a receipt and a Side, an income, a receipt added by Correction, and a vet's fee by hand;
- a wage, its second for the month refused, a wage without a month, a month on a repair, and next month's wage;
- a farm's own Category: a name taken twice, a standard name taken, retiring it, correcting money under it after it retired, entering under it refused, a record's Category and Wages not retired, and milk not entered by hand;
- the threshold: waiting, approved, asked again after a new Counterparty, the same notice standing through a note, a Correction without a reason refused, one with a reason bringing it under the threshold with the trail, and a record's money refused;
- Barn Staff, the Vet, the Owner and a Shed Phone refused, and a future day refused.

**Mutation-checked, each red:**
- a second wage the same month; a wage without a month; a month on a non-wage;
- a retired Category taking new money, or locking the money already under it;
- a record's Category or Wages retired; a duplicate Category;
- a vet's fee refused by hand;
- the receipt dropped on entry or on Correction; the Side dropped;
- a record's money corrected by hand; a note not cleared; a future day accepted;
- the Owner or a Shed Phone entering;
- no standard Categories;
- the receipt flag wrong in the list;
- approval surviving a new Counterparty;
- the Owner told again while nothing changed; old notices left standing.

## What the review changed

The Standards and Spec reviews ran in parallel. Changed:

- **An approval is of what the Owner read: the amount, the Counterparty and the Category.** A Correction changing any of them asks again. Before, an approved ৳30,000 could be redirected to another person, or to another Category, and stay approved. This applies to records' Money Events too. The glossary says so.
- **Notices:** each time money starts waiting, the Owner gets a new notice, and older ones come down. A Correction that leaves the waiting money as it was leaves the notice as it was. `alerts.mine` gains `about`, to read every notice about one Money Event.
- **Money under a retired Category can still be corrected.** Before, retiring a Category locked it.
- **Wages cannot be retired,** since the one-wage-a-month rule is kept by them.
- **A vet's fee can be entered by hand.** Milk, cattle, feed and medicine still cannot: their records book them.
- **Money entered by hand names its Side** when it belongs to one, so ticket 54 can report by Side.
- **Correction and receipt screens:** entered money can be corrected from the page, and a receipt that came later is added by that Correction.
- **Standard names are kept.** A farm's own Category cannot take a standard one's name, which would have left the records nowhere to book.
- **The standard Categories are given only when missing,** and the Audit Event records only what was actually added. Two requests at once, or a name the farm already had, no longer write events about nothing.
- **Money Event reads inside snapshots and notices are scoped to the farm.**
- **Wording:**
  - "entry", an _Avoid_ word, is gone: the source is `by_hand`, the correction is `correctEntered`, and the words are `byHand.*`;
  - the "worker" key is gone;
  - the unused `categoryId` is gone from the list.
- **Shared code:**
  - the record sources are one list, from which the money sources, the standard Category keys and the kept set are built;
  - the Counterparty input and the refused-write toast are shared;
  - the booking is split into the columns it writes and the telling of the Owner.

## Left open

- **Same-name Counterparties are one.** A Counterparty is recorded once per name, so two workers with the same name are one, and so is a worker named like a trader. They share one wage a month. Name them apart ("Karim, milker").
- **A receipt cannot be removed,** only replaced.
- **A wrong receipt is replaced by a Correction,** with a reason.
- **The standard-name refusal is not exercised by a test.** Reading the list gives the farm every standard Category first, so the name is already taken by the time a test can ask.
- **Records' Money Events carry no Side.** Ticket 54 works theirs out from the record, or asks.
- **The Money page still shows one period's list without totals.** Totals are ticket 54's.
