# Putting mistakes right, 2026-10-07

One of three cross-cutting reviewers, against main at 22b479da. Each finding is marked:

- **Proven:** a temporary test went red against main, and the file was then deleted. Four files were run: records entered twice, a Vet Fee, a voided death, a capital payment written twice, a settled Venture's Sale put right, and Settlement money put right before the last payout.
- **Traced:** read line by line through the code.

## Summary

The Correction machinery itself is sound. `corrections/correction.ts` locks the row, refuses a stale screen (`changed_since`), wants a reason, measures the window from when the entry reached the farm, works under the widest Role that reaches the record, refuses a settled Venture by name, writes before and after in the same transaction, and raises Needs Review for what an Effect cannot walk back. Earlier surveys added voids for a Sale, a death and a Receivable Payment. The gaps are now at the edges:

- **No way back.** Most records cannot be taken back when they were entered twice, because every amount or quantity must stay above nothing and only three kinds have a void. Some records have no Correction at all: a Vet Fee, a dose not prescribed, a sighting off the round, an Internal Sale, the terms of an Agreement, and an animal's sex, breed and birth date. An Investor's capital payment written twice is kept for good.
- **Figures that do not follow.** Two Settlement money paths leave a settled Venture Account reading something other than nothing.
- **Notices that stay up.** Notices are never taken down when the record that raised them is voided.
- **Shed Phone.** A milker who catches her own slip before her phone has sent it cannot put it right from the phone.

There are 19 findings: 5 high, 9 medium and 5 low.

## Record kinds: how a mistake is put right, by whom, within what window

The windows are Staff 2 hours on their own entries, Manager 30 days on any, Owner always, and Vet always on their own health entries (`domain/corrections.ts`). Each is measured from when the entry reached the farm.

| Record                                                                                                                                                         | How it is put right                                                                                                                                                         | Who                                                                                       | Window    | Taken back when entered twice or against the wrong one?            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------ |
| Step Completion (milking, weigh-in, feeding, dose, service, calving, dry-off, wean, release, move, round Observation, head/stock/medicine/cash count, renewal) | `work.correctStep`. The Effect runs again, keyed on the Completion. Wean, release, dry-off and calving acted on stand aside and go to Needs Review                          | Owner, Manager, Staff (own), Vet (own health Steps); a Pregnancy Check is the Vet's alone | By Role   | A skip, which must use one of the Version's reasons (C18)          |
| Sale                                                                                                                                                           | `sales.correct`: price, buyer, day, payment, broker, weight                                                                                                                 | Owner, Manager                                                                            | By Role   | Void by the Owner (`voided`)                                       |
| Mortality / cull                                                                                                                                               | `animals.correctMortality`                                                                                                                                                  | Owner, Manager                                                                            | By Role   | Void by the Owner                                                  |
| Intake                                                                                                                                                         | `intakes.correct`: price, toll, outing, owner, seller, payment, weight, age, window                                                                                         | Owner, Manager                                                                            | By Role   | **No void** (C7)                                                   |
| Buying / Selling Trip                                                                                                                                          | `buyingTrips.correct` / `sellingTrips.correct`: costs, day, place, payment                                                                                                  | Owner, Manager                                                                            | By Role   | Costs to nothing; a Selling Trip's animals cannot change           |
| Feed arrival / Harvest                                                                                                                                         | `stock.correct`                                                                                                                                                             | Owner, Manager                                                                            | By Role   | **No**: quantity at least 0.1 (C1)                                 |
| Medicine Purchase                                                                                                                                              | `drugs.correctPurchase`                                                                                                                                                     | Owner, Manager                                                                            | By Role   | **No**: doses at least 1 (C1)                                      |
| Milk Dispatch                                                                                                                                                  | `milk.correctDispatch`                                                                                                                                                      | Owner, Manager                                                                            | By Role   | **No**: litres above 0 (C1)                                        |
| Receivable Payment                                                                                                                                             | `receivables.correctPayment`                                                                                                                                                | Owner, Manager                                                                            | By Role   | Void                                                               |
| Receivable write-off                                                                                                                                           | `receivables.correctWriteOff`, to nothing                                                                                                                                   | Owner                                                                                     | Always    | Yes (to 0)                                                         |
| Money entered by hand                                                                                                                                          | `money.correctEntered`                                                                                                                                                      | Owner, Manager                                                                            | By Role   | **No**: amount above 0 (C1)                                        |
| Wage Draw                                                                                                                                                      | `money.correctDraw`, to nothing                                                                                                                                             | Owner, Manager                                                                            | By Role   | Yes (to 0)                                                         |
| Vet Fee                                                                                                                                                        | **none** (C5)                                                                                                                                                               | —                                                                                         | —         | **No**                                                             |
| Dose not prescribed                                                                                                                                            | **none** (C4)                                                                                                                                                               | —                                                                                         | —         | **No**                                                             |
| Sighting off the round                                                                                                                                         | **none** (C6)                                                                                                                                                               | —                                                                                         | —         | **No**                                                             |
| Diagnosis                                                                                                                                                      | `diagnoses.correct`: disease, note, outcome                                                                                                                                 | Vet (own)                                                                                 | Always    | **No**: the animal cannot change (C10)                             |
| Abortion                                                                                                                                                       | `breeding.correctAbortion`                                                                                                                                                  | Vet (own)                                                                                 | Always    | **No**, on purpose (C10)                                           |
| Prescription                                                                                                                                                   | `prescriptions.stop`                                                                                                                                                        | Vet                                                                                       | —         | Stop and prescribe again                                           |
| Excused Dose                                                                                                                                                   | **none**                                                                                                                                                                    | —                                                                                         | —         | **No** (C11)                                                       |
| Expected Calving                                                                                                                                               | `animals.correctExpectedCalving`                                                                                                                                            | Owner, Manager                                                                            | No window | —                                                                  |
| Animal: sex, breed, birth date, dam                                                                                                                            | **none** (C9)                                                                                                                                                               | —                                                                                         | —         | —                                                                  |
| Animal registered or calf written twice                                                                                                                        | **none** (C7)                                                                                                                                                               | —                                                                                         | —         | **No**                                                             |
| Missing / Lost                                                                                                                                                 | Found (`animals.found`)                                                                                                                                                     | Manager while Missing; Owner once Lost                                                    | —         | A Lost write-off against the wrong tag has no void (Owner choices) |
| Cash Handover                                                                                                                                                  | **none**; hand it back the other way                                                                                                                                        | —                                                                                         | —         | Counter-entry only (C11)                                           |
| Float counted home / Venture Float reconciled                                                                                                                  | **none**                                                                                                                                                                    | —                                                                                         | —         | **No** (C11)                                                       |
| Venture Movement (capital, Advance, Float out, payout, Farm's share)                                                                                           | `ventures.movements.correct`: amount above 0, day, reference. Refused for Sale, Intake, Internal Sale, made good, Farm's own capital, a counted Float, cancelled or settled | Owner                                                                                     | Always    | **No**: "never deleted" (C2)                                       |
| Reimbursement                                                                                                                                                  | Day and reference only; the figure follows the costs                                                                                                                        | Owner                                                                                     | Always    | —                                                                  |
| Internal Sale and wind-up buy-back                                                                                                                             | **none** (C3)                                                                                                                                                               | —                                                                                         | —         | Only a second Internal Sale the other way                          |
| Investment Agreement                                                                                                                                           | Amendment (split and Target Window only)                                                                                                                                    | Owner, every Investor                                                                     | —         | **No** correction of Units, stamp or Arbitrator (C8)               |
| Settlement approval                                                                                                                                            | Settlement Adjustment only                                                                                                                                                  | Owner                                                                                     | —         | Never re-opened                                                    |
| Settlement Adjustment paid / waived                                                                                                                            | **none**                                                                                                                                                                    | —                                                                                         | —         | **No** (C11)                                                       |
| Bank Check                                                                                                                                                     | Read the statement again                                                                                                                                                    | Owner                                                                                     | —         | —                                                                  |
| Eid date, Year Change                                                                                                                                          | Withdraw or correct                                                                                                                                                         | Owner                                                                                     | —         | Yes                                                                |
| A person's name                                                                                                                                                | `people.correctName`                                                                                                                                                        | Owner                                                                                     | No window | —                                                                  |
| Ration, SOP, Template versions                                                                                                                                 | A new Version; versions kept as written                                                                                                                                     | —                                                                                         | —         | —                                                                  |

## A. Records with no way back

1. **Proven, high. A record entered twice cannot be taken back, except a Sale, a death, a Receivable Payment or a Wage Draw.**
   - What happens: putting it to nothing is refused as invalid input, and none of these kinds has a void:
     - money entered by hand: `money-inputs.ts:16`, `amountInput` above 0, used at `corrections/money-by-hand.ts:62`;
     - a feed lorry or a Harvest: `stock-store.ts:776`, at least 0.1;
     - a Medicine Purchase: `corrections/medicine-purchase.ts:53`, doses above 0;
     - a Dispatch: `dispatch-store.ts:107`, litres above 0.
   - Proven: a ৳4,200 electricity bill and a 1,000 kg lorry were each entered twice, and correcting the second to 0 was refused for both.
   - Why a farm will meet this:
     - The Owner and the Manager both write up the same bill.
     - A Manager on a weak signal taps Save again.
   - What it costs: the cash in hand reads short by the bill, so the next Cash Count books a surplus. A phantom lorry sits in stock until a Stock Count calls it a shortfall, which is booked as shortfall money and moves the average price every Venture's feeding is charged at. A phantom Dispatch leaves a milk buyer owing for milk he never took, and he is named overdue.
   - What should happen: each of these takes a void with a reason, as the Receivable Payment did (trade survey C2). The void takes its Money Event with it.

2. **Proven, high. An Investor's capital payment written twice is kept for good.**
   - What happens:
     - `ventures.takeCapital` took the same ৳100,000 with the same transfer reference twice on one Agreement. Nothing checks the reference, and no unique index covers it (`db/schema/venture-account.ts:141-150`).
     - The second payment can only be corrected to another figure above nothing (`corrections/venture-movement.ts:189`). The code comment says "never deleted" (`:236-245`).
   - What it costs: on a Venture paid by the month, his share is worked out by the taka paid, so the duplicate raises his share of the profit. The portal shows the Investor money he never sent, and his Pay-in Notes close as paid.
   - What should happen: refuse a reference already on that Venture's account. Let the Owner void a capital payment with a reason; the trail keeps it.

3. **Traced, high. An Internal Sale, and the wind-up buy-back, can never be put right.**
   - What happens:
     - The Owner types the rate. The price is the weight times that rate, and the money moves between the Farm and the Investors.
     - Its two movements are refused with "That is one side of an Internal Sale; the sale itself is what to put right" (`corrections/venture-movement.ts:81-89`). Its Money Events are refused with "That money comes from a record; put the record right" (`corrections/money-by-hand.ts:45-50`).
     - But there is no Correction for the sale: `routers/ventures/trading.ts` has `sellInternally` at :213 and `buyWhatIsLeft` at :403, and nothing else.
   - The only way back is a second Internal Sale the other way. That needs a weigh-in from the last fortnight. It is refused once the Venture is Selling or she is Ready for Sale, and the buy-back cannot be reversed at all. Both papers then show two sales.
   - What it costs: a rate typed ৳3,50 for ৳350 a kilo moves the Investors' money and cannot be undone.
   - What should happen: an Owner's Correction of the rate, the weight used and the day, moving both movements and the Money Event together. Refuse it once either Venture's Settlement is approved.

4. **Traced, medium. A dose not prescribed can never be corrected or voided.**
   - What happens: `routers/treatments.ts:23-70` has no Correction beside it. The Manager types the tag, so a slip holds the wrong cow's milk and meat, and the cow that was really dosed is not held.
   - The only way to free the wrong cow is the Vet's Shorten. The false dose stays on her treatment register, passport and Withdrawal Summary. A wrong product or hour cannot be changed either.
   - What should happen: the same void as a death's: the Owner or Manager, with a reason. Her holds are worked out again from the doses that remain.

5. **Proven, medium. A Vet Fee can never be put right.**
   - What happens: there is no Correction kind for it. `money.correctEntered` on its Money Event is refused `correct_the_record`, "put the record right", and no such door exists (`corrections/money-by-hand.ts:45-50`, `routers/money.ts:292-366`).
   - Proven: a ৳15,000 fee that should have read ৳1,500 could not be changed by the Owner.
   - The glossary says otherwise: CONTEXT's Money Event entry says a Vet Fee's Correction puts its Money Event right.
   - What it costs: the fee is charged to the animals it names, Venture animals included.
   - What should happen: the Vet corrects their own fee (amount, day, animals, payment), and the Owner corrects any.

6. **Traced, medium. A sighting made off the round cannot be corrected or withdrawn.**
   - What happens: `observations.record` and the Shed Phone's sighting write an Observation with no Completion (`entries/observation.ts:54-88`). Only a Step's Correction sets `withdrawnAt` (`effects/observation.ts:63-71`).
   - Barn Staff make these. A heat on the wrong cow raises "Serve her" work and puts the wrong cow on the heat watch (`instances-store.ts:650`). Bloat or laboured breathing raises an hour's work for the Manager. Mouth or foot sores count toward the Pen alert.
   - What should happen: the round's rule. A Correction withdraws it, takes back the work it raised, and writes another beside it where one is meant. Whoever saw it may do this inside their window.

7. **Traced, medium. An Intake or a registration written twice leaves a ghost animal.**
   - What happens: neither has a void (`corrections/intake.ts:106-140`; `animals.register` has no Correction).
   - The ghost stands on the pen board and in the head count, so every evening's count is one short and opens a Missing.
   - Her only ways out are all false:
     - a death, which needs a photograph of her tag;
     - a Sale at nothing, which reads as given away;
     - a Lost write-off, which for a Venture's bull makes the Farm pay the Venture real money.
   - What should happen: an Owner's void of an Intake or registration that nothing was since built on (no weigh-in, Move, dose, Sale or Internal Sale). It is refused with words otherwise.

8. **Traced, medium. An Investment Agreement typed wrong cannot be put right.**
   - What happens: Units, stamp value, serial and date, and the Arbitrator are frozen at signing. An Amendment moves only the split and the window (`routers/ventures/agreements.ts:286-292`).
   - A slip (2 Units for 20, a serial mistyped) can only be undone by calling off the whole Venture, every Investor's money with it.
   - What should happen: a Correction of what was typed against the stamped paper, before any capital is taken on it (Owner choices).

9. **Traced, medium. An animal's sex, breed, birth date and dam can never be corrected after she is written down.**
   - What happens: only the official tag (`retag`), her State and Expected Calving can be changed (`routers/animals.ts:1298-1500`).
   - Breed is optional at Intake and cannot be added later. It decides her per-breed Expected Gain and the deshi judgement, and a heifer's first-service age (18 or 30 months). Sex decides which Side's routines she gets.
   - What should happen: a Correction of these by the Owner or Manager, with a reason. Sex is refused once breeding, calving or a crossing rests on it.

10. **Traced, low. A Diagnosis or an Abortion against the wrong animal stays on her.**
    - What happens: the Vet can change the disease, note and outcome, never the animal. The outcomes are only recovered or not recovered (`db/schema/health.ts:67`, `corrections/diagnosis.ts:29-36`).
    - A notifiable disease on the wrong cow can be taken off the list only by renaming it.
    - The Abortion is left so on purpose (`corrections/abortion.ts:21-24`), but it stays in her fertility figures.
    - What should happen: a Vet's void with a reason, kept in the trail.

11. **Traced, low. Several of the Owner's money acts have no Correction, and their way back says nothing about what it reverses:**
    - a cash Handover: the counter-entry has no link to the one it puts right (`routers/cash.ts:91-151`);
    - a Float counted home, and a Venture Float reconciled;
    - an Excused Dose (the Vet's);
    - a Settlement Adjustment paid or waived;
    - the reference on the last payout, which settles the Venture at once, so `venture_is_settled` refuses it from then on;
    - the Farm's own capital in a Venture, refused `the_farms_own_capital` with nowhere else to go (`corrections/venture-movement.ts:101-109`).

## B. A correction or void that leaves what was worked out from it behind

12. **Proven, high. Correcting a settled Venture's Sale moves money in an account that is closed.**
    - What happens:
      - A Sale is the one record a settled Venture lets through (`corrections/correction.ts:185-191`).
      - For a bank-paid Sale, `bookSaleProceeds` rewrites its `sale_in` movement (`venture-store.ts:1124-1190`).
      - On a Venture approved at ৳300,000 proceeds and paid out, the price was corrected to ৳250,000. The settled Venture then read a balance of −৳50,000.
      - February's Bank Check went stale. Reading the statement again gave "out by ৳50,000" for good, while the Settlement still said ৳300,000.
    - Corrected upward (as `settlement.test.ts:1066` does), the extra lands in the closed account and the Adjustment pays the Investors from the Farm's books as well.
    - What should happen: once a Settlement is approved, a Sale's Correction moves the costing and raises the Adjustment, but not the Venture Account. Or the difference goes to the Farm's books, where an Adjustment's money already goes.

13. **Proven, high. The Farm's share and an Investor's payout can be corrected between the first payment and the last.**
    - What happens: `whyItStands` says nothing about `payout`, `advance_repaid`, `farm_share` or `farm_loss_in` (`corrections/venture-movement.ts:52-131`), so the screen offers Correct.
    - Proven: the Farm's share was taken (৳38,400) while the Venture was still Selling, then corrected to ৳48,400.
      - The Farm's Money Event stayed at ৳38,400 (`routers/ventures/settlement.ts:183`).
      - After the Investor's payout the Venture settled at −৳10,000.
    - Correcting a payout's amount moves it off the frozen share the same way.
    - The code already refuses `made_good` and the Farm's own capital for exactly this reason, "the Venture and the Farm's books would disagree about one transfer".
    - What should happen: refuse the amount on all four. Allow only the day and the reference, and move the Money Event's day and reference with them.

14. **Proven, medium. Notices stay up after the record that raised them is voided or corrected away.**
    - Proven: after the Owner voided a death, her "died" notice (`mortality_recorded`) and the Vet's "no Diagnosis named" notice (`mortality_undiagnosed`) were both still unread.
    - Traced, the same for:
      - `sold_under_cost` and `receivable_overdue` after a Sale's void;
      - `notifiable_diagnosis` after the Vet takes the disease off the list (its report work is closed, the notice is not: `corrections/diagnosis.ts:105-130`);
      - `head_count_differs` after a recount that agrees;
      - `cash_short`, `store_shortfall` and `medicine_short` after a count is corrected;
      - `arrival_weight_short` after an Intake's weight is corrected;
      - `pen_sores_seen` after the round's Observation is withdrawn.
    - Only money approvals (`money-store.ts:676-692`) and the day's sweep for work, Missing and backups (`settled-notices.ts`) take a notice down.
    - Pushes already sent cannot be unsent, and nobody is told it was taken back. The Vet is left asked to look into the death of a bull who is standing in his Pen.
    - What should happen: a void or Correction settles the notices about its record. For the death and notifiable kinds, whoever was pushed is told it was taken back.

15. **Traced, medium. A weigh-in an Internal Sale was priced from can be corrected, and nothing follows.**
    - What happens: `internal_sale` keeps `weigh_in_id` and the weight (`db/schema/fattening.ts:326-327`). The weigh-in Effect never looks at it.
    - A 312 kg reading corrected to 213 leaves the sale priced at 312 kg. The Owner is not told, nothing marks the sale, and C3 means the sale cannot be put right either.
    - What should happen: refuse to correct a weigh-in an Internal Sale used, or tell the Owner the money difference.

16. **Proven, low. The settlement statement says its figures were frozen, but its herd story is read live.**
    - What happens: after C12's correction, the reprinted statement said "Proceeds ৩,০০,০০০" beside "Sold: ১ · average ২,৫০,০০০". Its footer says "These figures were frozen on the day this settlement was approved". `theirHerdStory` reads today's Sale prices (`investor-statement-store.ts:583-585`).
    - What should happen: freeze the counts and averages with the Settlement, or say on that block that it moves.

## C. Shed Phones

17. **Traced, medium. A Barn Staff member who catches her own slip before the phone has sent it cannot put it right from the phone.**
    - Correcting it fails:
      - The board shows the queued entry under the id the farm will give it (`apps/web/src/lib/record-offline.ts:97-130`).
      - Correct, with a reason, goes online at once rather than into the Outbox (`lib/step-answer.ts:69-87`, `routes/_authenticated/work/$instanceId.tsx:173-190`).
      - With no signal she is shown the browser's "Failed to fetch". Online but before the 15-second send, the farm answers "No such step" in English, with no refusal word.
    - Entering it again fails too:
      - A second answer goes into the Outbox and is kept as late.
      - Needs Review cannot take it in: `takeIn` refuses "That is already recorded; correct it instead" (`routers/review-queue.ts:216-300`).
      - The Manager has to make the Correction by hand.
    - Once the entry has reached the farm, she can correct it on a Shed Phone inside her own two hours.
    - What should happen: the Outbox holds a Correction of an entry it still holds, or replaces the held entry before sending it.

18. **Traced, low. A Step answer has no "written by mistake".**
    - Taking back a campaign dose tapped on the wrong cow means a skip, and the skip must be one of the Version's reasons (`completion-store.ts:147-160`). The standard vaccination offers only "Unwell — to be given later" (`domain/standard-playbook.ts:563-566`). That says something false about her and keeps the dose owed.
    - What should happen: a Correction may say the Step was written by mistake, with its reason, distinct from a skip.

## D. Words and the trail

19. **Traced, low. Several refusals send the Owner to a door that does not exist.**
    - "put the record right", `correct_the_record`, said of a Vet Fee's or an Internal Sale's Money Event;
    - "the sale itself is what to put right", `one_side_of_a_sale`;
    - "not put right on the Venture's side alone", `the_farms_own_capital`;
    - `made_good_with_the_farms_money`.
    - All are worded in Bangla (`apps/web/src/lib/correction-refusal.ts`), but none has a Correction on the other side. Each should name what to do instead, or the door should be built (C3, C5, C11).
    - A Correction refused because the Step has not arrived yet is said in English, "No such step" (C17).

## Owner choices

- **Voids for records entered twice (C1, C7).** Who may void: the Owner only, as for a Sale and a death, or whoever wrote it inside their window, as for a Receivable Payment?
- **Investor capital written twice (C2).** Does "a movement is never deleted" allow an Owner's void with a reason, kept in the trail as voided? Or must the duplicate be put right into his next real payment?
- **After a Settlement is approved (C12, C13).** Should a Sale's Correction leave the Venture Account alone and land wholly as an Adjustment from the Farm's books? Should the Owner be able to take back an approval before the first payout goes?
- **Agreement typos (C8).** Correctable until the first capital is taken on that Agreement, or until the Venture starts Buying?
- **A Lost write-off against the wrong tag.** Found brings her back as the Farm's own, at what was made good. Should a wrong-tag write-off be voided as a death is, with the made-good money returned to the Farm, rather than handing her bull to the Farm?
- **The Staff window (2 hours from receipt).** A milker who sees her slip the next morning must ask the Manager. Is "until the end of her next shift" the farm's wish?
- **Offline Corrections (C17).** Should the Outbox carry Corrections, or should Corrections stay online-only, with words that say so?
- **"Taken back" pushes (C14).** Which voided notices should push a follow-up? At least the death and the notifiable disease.

## Checked and holding

- **The Correction core.** It holds the row, refuses a stale screen with the values now held, and refuses a Correction that changes nothing or has no reason. It picks the widest Role whose window and Scope reach the record. Who may correct is asked before the settled check. The Audit Event carries the reason, the Role, before and after, and the event it supersedes, in the same transaction. Needs Review is raised for an Effect that stood aside and for work already signed off.
- **The Sale and death voids.** Owner only. Each keeps `state_before` and brings her back as she was. Its money goes to nothing and the work raised since is called off. Photographs are kept, and the trail names her. A void is refused once the Settlement is approved, once the cash is deposited, or once a payment was made against that Sale.
- **Receivable Payments, Wage Draws and write-offs.** A Receivable Payment voids. A Wage Draw and a write-off go to nothing. The buyer is locked, and nobody is left owing below what he paid.
- **A Step's Correction runs its Effect again.** This covers Milk Records and the bulk total, weigh-ins (with the doubted readings judged again), the feeding as it was, the counts, doses and their holds (a skip included), and a round Observation withdrawn with another written beside it. Wean, release, dry-off and a calving that was acted on stand aside to Needs Review.
- **The DLS report.** A Diagnosis corrected onto or off the notifiable list raises or closes the report work.
- **Venture Movement Corrections.** They refuse a Sale's, an Intake's, an Internal Sale's, a made-good, the Farm's own capital, a counted Float, a called-off Venture and a settled one. Capital stays within its Units. Waiting Pay-in Notes close when the paper is filled.
- **Settled Ventures.** A Correction that reaches a settled Venture through feed prices, herd costs or a Pen's feeding is refused, and every such Venture is named.
- **Approval asked again.** A Correction to an amount, Counterparty or Category is asked again of the Owner.
- **Shed Phones.** `work.correctStep` works on a Shed Phone under the switched-in person's own window. A held entry can be taken in from Needs Review or set aside with a note. A refused entry shows its values in Sent back to be put in again.
- **Words.** Every refusal word the Correction paths send has Bangla words on the web.
