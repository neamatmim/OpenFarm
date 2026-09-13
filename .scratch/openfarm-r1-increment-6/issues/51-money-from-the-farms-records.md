# 51 — Money from the farm's own records

**What to build:** Most of the farm's money is already written down somewhere else. A Dispatch is a milk sale, an Intake is a cattle purchase, a Sale is a cattle sale, a feed Purchase is feed bought, and a medicine purchase is medicine bought — each becomes a Money Event on its own, linked back to the record that caused it, so finance is mostly free. The Vet enters their own visit fee.

The Owner decided on 2026-09-13 that **approval holds back the money, not the record**: a Sale, Intake or Dispatch over the Approval Threshold is recorded and the animal or the milk leaves as usual, and its Money Event waits, marked unapproved, on the Owner's queue until the Owner approves it.

**Blocked by:** 48, 50

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 6, user stories 77 and 79; [Finance in Release 1](../../openfarm-release-1/issues/13-finance-in-release-1.md); roles matrix — Money Events, Intake / Sale, Dispatch; [Notification channels](../../openfarm-release-1/issues/23-notification-channels.md) (Money Event awaiting approval → Owner, digest); `CONTEXT.md` — **Money Event**, **Category**, **Counterparty**, **Approval Threshold**.

- [x] A Dispatch, an Intake, a Sale and a feed Purchase each create their Money Event in the same act — amount, date, direction, Category, Counterparty, payment method, and a link to the record — and a Correction to the record corrects its Money Event rather than adding a second
- [x] A medicine purchase records the Drug List product, how much, the price, the supplier, and roughly how many doses it holds (the Owner's decision, 2026-09-13), and creates its Money Event
- [x] The Vet records their own visit fee, optionally naming the animals seen, and it becomes a Money Event; the Vet sees no other money
- [x] A Money Event over the Approval Threshold (a Farm Parameter, BDT 20,000) waits unapproved on the Owner's queue and in the Owner's digest; approving it is the Owner's alone and recorded; the record that caused it is never held back
- [x] Barn Staff never see money anywhere
- [x] Tests cover each record creating its Money Event once, a corrected record correcting it, a medicine purchase, the Vet's fee, the threshold holding the money and not the Sale, the Owner approving, and nobody else being able to

## What was built

**Money Events** have a new record in the database. Each one holds the amount in taka, the day, the direction, the Category and the Counterparty. It also holds the payment method (cash, bKash or bank), a link to the record that made it, and where it stands with the Owner (`not_needed`, `awaiting`, `approved`). A unique index on the record link means one record makes one Money Event.

**Categories** have a small table of their own. For now it holds only the Categories the records need, each made the first time a record needs it: milk sales, cattle sales, cattle purchases, feed, medicine and vet fees. Ticket 52 adds the farm's own Categories and retiring them.

**Six records book their money** inside their own transaction, through one store function.

| Record | Money Event |
| --- | --- |
| Dispatch | litres × price per litre, money in |
| Intake | purchase price, money out |
| Sale | price, money in |
| Feed Purchase | the lot's price, money out; a Harvest books nothing |
| Medicine Purchase | price, money out |
| Vet Fee | the fee, money out |

- **Payment method** is on each record's form and input. Left unsaid, it is cash.
- **A price of 0** on an Intake or a Sale is a gift and books nothing. If a Correction later gives it a price, that price is booked.

**Corrections re-book the same Money Event.** This holds for a Dispatch, a feed Purchase, and new Manager's Corrections to an Intake (`intake.correct`) and a Sale (`sale.correct`).
- A Correction can change the price, the counterparty or the payment method.
- The Correction's trail shows the Money Event either side.

**Medicine Purchase** (`drugs.purchase`, the Manager's) records:
- the Drug List product;
- how much, in the words on the box;
- roughly how many doses it holds;
- the price, the seller and the day.

A retired product is refused, and so is a day that has not come yet. `drugs.purchases` lists them for the Owner and Manager.

**Vet Fee** (`money.vetFee`, the Vet's own and from a personal phone) records:
- the amount and the day;
- a note;
- the animals seen, by tag.

A day that has not come yet is refused. `money.myFees` is the only money the Vet sees.

**The Approval Threshold** is a new Farm Parameter, BDT 20,000. The Owner and the Manager may set it, as the roles matrix says. Barn Staff and the Vet no longer see it in `farm.current`.
- **Over the threshold,** money the Owner did not enter waits.
- **The Owner hears in the digest** (`money_awaiting_approval`) and sees it at the top of the Owner's queue.
- **Approving** (`money.approve`) is the Owner's alone, from a personal phone. The Owner names the amount they read, and it is audited.
- **The record is never held back.** The bull arrives and the cow leaves sold.

**Web**
- a payment method field on the Dispatch, Intake, Sale and feed Purchase forms;
- a Medicine Purchase form and list on the Drug List page;
- a Vet Fee form and list on the Vet page;
- an approve row on the Owner's queue;
- a Money page (Owner and Manager) listing a period newest first, with approval.

**Seven tests** in 2037:
- **Dispatch:** booked once; a correction re-books it and the trail shows the money.
- **Intake, Sale and feed Purchase:** each books once and each correction re-books; a harvest books nothing; the Owner's own correction over the threshold does not wait.
- **The threshold:** an Intake over it and a Sale over it wait while the bull and the Sale go ahead. The item is on the Owner's queue with a notice. Manager, Vet and Staff are refused approval, and so is a stale amount. The Owner approves: audited, the notice taken down, and a second approval refused.
- **Approval is of an amount:** a note keeps it; a changed amount asks again with a new notice; back under the threshold, the notice comes down.
- **Medicine Purchase** with its doses.
- **The Vet Fee:** with the animals seen; the Vet refused the money list, the Manager refused the fee, and a future day refused.
- **Barn Staff:** no money, and neither Staff nor the Vet reads the threshold.

**Mutation-checked, each red:**
- a correction adding a second event;
- no threshold, or an approval surviving a changed amount, or lost on a note;
- the Manager approving, an approval twice, or a stale amount approved;
- a feed or Intake or Sale correction ignoring the money;
- a harvest booked;
- no notice, or notices not taken down on approval or re-booking;
- the Vet Fee open to the Manager, or a future visit accepted;
- the queue reading the wrong state;
- Staff seeing purchases or the threshold;
- the payment method not shown;
- the Owner's own money waiting;
- the trail without the money.

## What the review changed

The Standards and Spec reviews ran in parallel. Changed:

- **Intake and Sale can now be corrected**, as the Manager's Correction with a reason inside the window, and the correction re-books their Money Event. Before, the rule held only for Dispatch and feed Purchase.
- **Approving names the amount.** One corrected while the Owner was reading it is refused (`amount_changed`). The update applies only while the Money Event still waits at that amount, so two approvals at once cannot both be recorded.
- **The Owner's notices are taken down** when the money is approved, corrected to another amount, or brought under the threshold. Before, the digest could list approved money, or one Money Event twice.
- **The Money Event is on the record's trail:** a Dispatch, Intake, Sale or feed Purchase correction now shows it before and after. A change of payment method, or an approval reset, used to leave identical snapshots.
- **The Owner's own money does not wait for the Owner.** The glossary says the threshold is for money the Owner did not enter, and the Approval Threshold entry now says so.
- **The threshold is the Owner's and the Manager's to set,** per the roles matrix (Farm parameters — R U for both). The first version had made it the Owner's alone without that being decided. It is also hidden from Barn Staff and the Vet in `farm.current`.
- **The money lookup is scoped to the farm.**
- **The money list:** newest first, capped at 500 with a flag when there is more. The page's in/out totals are gone; they belong to the accountant's report in ticket 54.
- **Shared code:**
  - the money inputs moved to their own module, out of a router;
  - the Dispatch and Purchase bookings share one helper for create and correct;
  - the approve action, Category naming and payment-method wording are shared on the web.
- **Wording:** "Category" rather than "heading"; the refusal words back in order; **Medicine Purchase** and **Vet Fee** added to the glossary.
- **Tests:**
  - they no longer move the farm-wide threshold;
  - a Sale over the threshold is now tested;
  - the file retires its feed item.

  One full run in three had failed the Stock Count file: that file's count, on a 2035 clock, found this file's 2037 lorry in the store as a difference nobody gave a reason for.

## Left open

- **No web screen corrects an Intake or a Sale**, as none corrects a Dispatch. The Corrections exist in the API.
- **A Medicine Purchase and a Vet Fee cannot be corrected yet.**
- **The Medicine Purchase has no Shed Phone guard,** like feed receiving. The Vet Fee and the money list and approval do have one.
- **The Money page is a list, not a report.** Totals by Category, Counterparty and Side are ticket 54's.
- **Owner question:** should the Manager be able to raise the Approval Threshold that holds the Manager's own spending? The roles matrix says yes today.
