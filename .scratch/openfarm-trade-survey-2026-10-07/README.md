# Survey of buying and selling cattle, 2026-10-07

Three reviewers each took one part: buying (trips, Floats, Intakes), selling (Sales, Ready for Sale, Eid, selling trips, Internal Sale), and money buyers still owe (Receivables, Counterparties, SMS). Each finding is marked:

- **Proven:** a temporary test went red against main at 39d375bb, and the file was then deleted.
- **Traced:** read line by line through the code.

Two reviewers found the same defect in the Sale's void (C3); it is listed once.

## A. Floats on a buying trip

1. **Proven, high.** A bull sold to another purse by Internal Sale before her Float is counted home drops out of the count. `whatTheFloatBought` counts the outing's animals whose owner _today_ is the Float's purse (`venture-store.ts:612-633`), and an Internal Sale does not ask about an open Float (`routers/ventures/trading.ts:212-330`). A Farm float read ৳62,000 bought for ৳122,000 spent; a Venture Float was refused `float_short` by ৳60,000, and the Venture cannot settle. Count what the outing bought _for_ that purse (`ownerWhenBought`).
2. **Proven, medium-high.** A Venture can finish buying while its Float is out (`routers/ventures/lifecycle.ts:156-235`). The bulls still on the lorry are then refused as the Venture's (`venture_wrong_state`) and as the Farm's (`not_whose_float_bought_her`), and the Float can never balance.
3. **Proven, low-medium.** A bull paid by mobile money or bank on a Farm-float outing is still counted against the cash (`venture-store.ts:612-633`, `cash-store.ts:604`). The true cash back is refused `float_over`.
4. **Traced, medium.** A Venture Float that went over or came home short has no way out. The count must balance to the taka (`capital.ts:497-515`, `count-float-sheet.tsx:78-84`) and an outing takes one Float (`capital.ts:398-402`). ৳500 lost on the road keeps the Venture from ever settling.
5. **Proven, medium.** A Farm bull taken in while the Owner counts the float home lands on the closed float: a Farm Intake takes the Farm lock only when it has a `ventureId` (`routers/intakes.ts:291-306`). 8 of 8 rounds.
6. **Proven, medium-low.** A Venture Float drawn at the moment a Farm bull is taken in on the same outing leaves the outing mixed: `floats.draw` checks the outing's owners before the lock (`capital.ts:330-356`). 6 of 6 rounds.
7. **Traced, low-medium.** Intakes and Buying Trips take no `heldBy` (`money-store.ts:491-508`), so the Owner writing up the Manager's bulls takes the cash off the Owner's hand. What was left of money survey D8.
8. **Traced, low-medium.** A Venture Float's open cash is in nobody's hand (`cash-store.ts:175-226`). Notes counted on a Friday haat evening become a Farm surplus.
9. **Traced, low.** Screen gaps:
   - the Draw Float sheet offers outings it will refuse;
   - the Farm float Handover offers counted-home outings, by name only;
   - the intake form keeps a Float's Venture after the outing changes;
   - the count-home amount goes stale;
   - one market typed two ways is split in Early Losses (`early-losses.ts:55`).

## B. The day a thing happened

1. **Proven, high.** Correcting a Sale's day can move it inside her meat Withdrawal. `sales.record` asks the gate; the day Correction only asks `correctHowSheLeft` whether she was here (`corrections/sale.ts:214-235`, `herd-store.ts:1163`). This is the back-dating the gate exists to stop (`sales.ts:122-124`).
2. **Traced, medium-high.** The intake form and the new-trip sheet send no day (`intakes.tsx:142-173`, `buying-trip.tsx:72-79`), and a trip's day cannot be corrected (`corrections/buying-trip.ts:39-47`). A lorry written up next morning is put on the wrong day: her Quarantine and Pen, the trip money, and her cash, which comes off the hand again after Friday's Cash Count (money survey A1).
3. **Traced, medium.** The sale sheet sends no day either (`components/sale/sale-sheet.tsx:398-421`), so a Sale written up next morning is booked today, and the Withdrawal gate is asked about today. The server takes `soldAt` already.
4. **Proven, high.** An Internal Sale and the wind-up buy-back can be dated in the future (`trading.ts:224,410`, `internal-sale-store.ts:97`; no `max` on `internal-sale-sheet.tsx:291`, `buy-what-is-left-sheet.tsx:302`). She then cannot be recorded dead or sold until that day.
5. **Proven, low.** An Intake corrected onto an outing that went after she arrived is accepted (`corrections/intake.ts:212`). Herd survey B7 was fixed on recording only.
6. **Proven, low.** A Sale's day moved later than the buyer's promised day is accepted; the check reads the old `soldAt` (`corrections/sale.ts:247`). Dispatch reads the new one.

## C. Corrections and voids

1. **Proven, high.** The same taka counted twice when "paid at the gate" is corrected after the buyer paid off the rest. ৳50,000 bull, ৳10,000 at the gate, ৳40,000 paid later, then paid-now corrected to ৳50,000: ৳90,000 cash in. Dispatch has the same gap (`corrections/sale.ts:237-261`, `corrections/dispatch.ts:103-130`).
2. **Proven, high.** A Receivable Payment can never be taken back. The amount must be positive (`money-inputs.ts:16`), there is no void, and the buyer and kind cannot change, although the screen says a wrong-buyer payment "is taken back and written again" (`receivable-corrections.tsx:12-13`).
3. **Proven, medium.** A Sale cannot be voided if its buyer has _ever_ paid any Receivable, milk or cattle (`corrections/sale.ts:87-97`). A regular trader's mistaken credit Sale stays Sold for good. Ask whether anything cleared _this_ Sale (`owingNowOf`).
4. **Proven, medium.** Correcting a Sale's buyer after he paid part: the new buyer owes the whole price and is named overdue, the old one shows paid ahead, and the write-off stays on the old buyer (`corrections/sale.ts:269-278`, `corrections/dispatch.ts:150-152`, `receivable-store.ts:155-160,209-210`).
5. **Proven, medium.** Voiding a Venture's first Sale leaves the Venture in Selling (`corrections/sale.ts:69-152` against `sales.ts:281-313`). It takes no more Monthly Sums and refuses Internal Sales, and its state cannot be moved back.
6. **Proven, medium.** Correcting a Venture's cash Sale price after the cash was deposited rewrites the deposited movement (`venture-store.ts:1147-1165`). The Venture Account claims money the bank never got. The void is already refused there.
7. **Traced, medium.** The Intake correction screen offers price, toll, seller, owner and window only (`money-papers-tab.tsx:84-91`); not the outing, payment method or account, which the server takes. Arrival weight and age cannot be corrected anywhere (`corrections/intake.ts:106-126`).
8. **Traced, low.** A Sale's day correction does not tell the Owner again about selling under cost (`corrections/sale.ts:304-311`), and does not check the Selling Trip that carried her.
9. **Traced, low.** `correctPayment` and `correctWriteOff` take no buyer lock (`corrections/receivable-payment.ts:78-94`, `receivable-write-off.ts:38-51`), so a raise can race a payment past "no more than owed".

## D. Buyers, notices and Eid

1. **Proven, medium.** The Sale and Dispatch sheets' warning that a buyer owes, is overdue or was written off misses him when his name is typed another way. `receivables.ofBuyer` and `pay` look up by exact name (`routers/receivables.ts:57-61`) while the Sale matches ignoring case and in NFC. Every Bangla name with য় misses it.
2. **Traced, low-medium.** A buyer's phone can never be put right: the first one is kept and later ones dropped (`counterparty-store.ts:49-57`), and nothing edits a Counterparty.
3. **Proven, low-medium.** Cattle sold on credit to a buyer whose milk is overdue is not named to the Owner (`receivable-store.ts:564-566`). Credit to a buyer once written off is warned on the sheet only, though the Baki plan said the Owner is told.
4. **Traced, low.** A promised day that is moved later is never told again when it lapses: the overdue notice is keyed on the Sale or Dispatch alone (`receivable-store.ts:617-628`).
5. **Traced, low.** SMS delivery is judged on `response.ok` alone, with a 5-second timeout (`sms-gateway.ts:40-45`, `sms-send.ts:207`). A gateway answering 200 with an error is never retried; a slow success is sent twice. (Only the two safety texts go by SMS; no buyer is ever texted.)
6. **Traced, medium, the Owner's.** The Target Window reason for Ready for Sale appears only once Eid day 1 has begun (`domain/ready.ts:35`). Qurbani cattle sell at the haat in the week before.
7. **Traced, low.** The Selling Trip form offers a dairy cow culled to a butcher that day, then refuses her `not_on_that_lorry` (`selling-trips.ts:81-86,214`).

## Checked and holding

- One purse to an outing; a counted Float refuses new animals, cost changes and moves; counting home is behind the Farm lock.
- `arrived_before_the_trip` holds on recording; arrivals and outings dated tomorrow are refused.
- Two phones selling one animal: the lock and `she_is_gone` stop it.
- A Venture's animal is sold paid in full, never on credit or by mobile money, and her money goes to her owner as of the Sale.
- No Sale or death before her last Move or the Internal Sale that made her the new owner's.
- Ready re-reads State and Withdrawal in the transaction; suggestions hide animals under Withdrawal.
- Internal Sale: Owner-only, locked, weighed recently, budget held, bank only.
- Cash-day accounting: the gate's cash at the Sale, each payment its own Money Event on its day; a future `paidOn` refused.
- Oldest-first clearing, paid ahead, and write-offs flow again on read; `pay` and `writeOff` lock the buyer.
- Margin, Costs, Returns, Seasons and dairy figures take write-offs off in one place (`cost-store.ts:244`).
- Every refusal in buying and Receivables has Bangla words; sellers are matched ignoring case, in NFC.

## Decisions (the Owner, 2026-10-07)

- D6: Ready for Sale suggests on the Target Window from a set number of days before Eid day 1: a Farm Parameter, 10 days by default.
- A4: a Venture Float may be counted home with a difference and a reason, as a Cash Count is, and the Owner is told. No top-up.
- C2: a Receivable Payment can be voided, as a Sale is: by whoever wrote it inside the Correction Window, by the Owner at any time. Its Money Event goes with it.
- A8: a Venture Float's open cash is expected in the carrier's hand, as a Venture's sale cash is. The carrier is named when the Float is drawn.

Defaults taken without asking, as the obvious reading:

- A1: a Float counts what the outing bought for its purse (`ownerWhenBought`), whoever owns her now.
- A2: "finished buying" is refused while a Float is out, naming the outing.
- A3: only cash paid from the hand counts against a Float.
- B: every form that records something done on a day (Intake, Buying Trip, Sale) has a day field, `max` today; a Buying Trip's day can be corrected; an Internal Sale and buy-back cannot be dated after today; a Sale's day correction asks the Withdrawal gate, the promised day and the Selling Trip, and tells the Owner again about selling under cost.
- C1: a Sale or Dispatch Correction is refused when it leaves the buyer owing less than his payments already cleared ("correct the payment instead").
- C3: a Sale's void asks whether anything was paid against this Sale.
- C4: a buyer change is refused once payments or write-offs stand against the Sale.
- C5: voiding a Venture's only Sale puts back the state it had before, and the trail says so.
- C6: a price correction on a Venture's cash Sale is refused `money_moved_since` once the cash is deposited.
- C7: arrival weight and age can be corrected, and the Intake correction screen offers outing, payment method and account.
- D2: the Owner or Manager can edit a buyer's phone; the old number stays in the trail.
- D3: credit sold to a buyer overdue in either kind, or once written off, is named to the Owner.
- D4: a moved promise is told again when it lapses.
- D5: an SMS counts as sent only on the gateway's own success word, where it gives one.

## Status

| Group | Branch | Status  |
| ----- | ------ | ------- |
| A     | fix/floats | Done, merged 6c5c4923 (Float counts by purse that bought, cash only; buying closing refused while a Float is out; reasoned difference on a Venture Float's count, kept on the float_back; carrier named on the draw and the open Float in that hand; Intake/Buying Trip `heldBy`; Intake on an outing locks; draw checks the outing behind the lock; screen gaps fixed; migration 20261006215649 applied to OpenFarm and openfarm_seed. Not done: an over-count records the difference only — the Farm's notes spent for the Venture are for the Owner to settle by Adjustment; and with the Owner counting, there is nobody else to tell) |
| B     | fix/the-day-it-happened | Done, merged aa1d13e8 (a Sale's day correction asks the Withdrawal gate, the promise and the Selling Trip, and tells the Owner of selling under cost again; Internal Sale and buy-back refused in the future, date boxes capped; Intake correction checks the outing's day; a Buying Trip's day correctable; day/time boxes on the sale sheet, Intake form and new-trip sheet) |
| C     | fix/corrections-and-voids | Done, merged 15e3bacb (`owed_below_paid` and `paid_on_by_this_buyer` on Sale and Dispatch Corrections; payment void; Sale void asks this Sale's payments; Venture back from Selling on its only Sale's void, `sale.venture_state_before` migration 20261006213123 applied to OpenFarm and openfarm_seed; deposited cash price refused; Intake weight/age correctable and the screen offers outing, payment and account; buyer lock on payment and write-off corrections) |
| D     | fix/buyers-notices-eid | Done, merged 594227aa (sheets find a buyer as a Sale does; `receivables.setPhone`; credit-again judged across kinds, `credit_after_write_off` notice, migration 20261006222043; overdue told again on a moved promise; `farm.ready_lead_days` 10, migration 20261006221543; Selling Trip offers Fattening only; `SMS_GATEWAY_SUCCESS`. Left: a send that times out is still tried again — two texts of a safety notice rather than none) |
| Screens | fix/trade-screens | Opened on the seed 2026-10-07 and merged 90dd34a6: the outing sheet no longer shows through the Float sheet; the hand box says paid; outings carry their day. Not opened: the count-home sheet's difference (no open Float in the seed) |
