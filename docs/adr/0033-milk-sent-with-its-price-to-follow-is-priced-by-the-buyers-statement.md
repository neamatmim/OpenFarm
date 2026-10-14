# Milk sent with its price to follow is priced by the buyer's statement

Date: 2026-10-14

A processor's collection center — Milk Vita, PRAN, Aarong/BRAC Dairy, Akij — takes the farm's milk every day, tests its
fat and SNF, and pays a fortnight or a month later by a statement of its own: its count of the liters, and the rate it
set from what it tested. Until now a Dispatch had to carry a price, so the Manager made one up at the gate; that guess
became a Receivable, the month's milk money and what a liter fetched, and nothing ever set the center's own figures
beside it. The flow survey of 2026-10-13 (G4) asked for "price to follow" and a buyer-statement settlement. The Owner
delegated the open choices; these are the recommendations, taken.

## Decision

- **Price to follow.** A Dispatch may go with its price to follow instead of a price (`priceToFollow`). It has its
  liters, its fat and SNF and its Delivery Note as any Dispatch, and no money: no price, nothing paid at the gate — money
  said paid on it is refused (`price_to_follow_paid`) — and no Receivable. Its price per liter is kept as nothing, never
  as nought. **Only for a buyer who takes his milk on credit** — more of his last five Dispatches all on credit than
  not — **or one the farm has sent nothing to in half a year**, whose terms the sheet sets now; a buyer whose recent
  milk he paid for at the gate is refused (`price_to_follow_pays_at_gate`): milk nobody will send a statement for would
  wait forever. The sheet offers the box only for such a buyer, and ticks it where his last milk went so; the milk
  buyers' list counts it as taken on credit. A buyer kept under two spellings from before names were compared is one
  buyer to his statements: his milk under either is set beside them and priced by them.
- **A Buyer Statement** («ক্রেতার বিল») is recorded by the Manager or the Owner from the buyer's paper: the buyer, the
  first and last farm day it covers, its date, the day he pays by (left out: its date and the farm's days for
  Receivable), his liters and his amount, and as he gives them his number, average fat and SNF, his rate and a photo.
  The phone's own id makes a save sent twice one statement — asked behind the Farm's lock, so two sends at once find
  each other rather than an overlap. It is refused for days another standing statement of his
  covers (`statement_overlaps`), under a number of his already used (`statement_number_taken`, any capitals), and with
  days out of order or after today (`statement_days`).
- **Set beside the farm's own milk.** Every Dispatch to that buyer in its days is read: the farm's liters against his,
  the difference in liters and as a part of the farm's (a count short of the farm's is short measure, said in the
  warning color), the milk priced at the gate and what it came to, and the milk with its price to follow. The sheet
  shows it as the statement is typed, before it is saved, and the Statements tab shows it for every statement as the
  farm's milk stands now: what it priced stays what it priced, and his amount is set against the gate's milk and its
  own, so a can priced at the gate written into its days afterwards shows as the difference it is.
- **Settling prices the milk to follow.** Recording the statement prices every Dispatch to him in its days whose price
  was to follow: his amount less what the milk priced at the gate came to, spread over them by their liters in whole
  paisa, the paisa the shares leave over placed one each where the rounding lost most, the older Dispatch first between
  equals — so the same statement always prices the same milk the same way (`spreadByLiters`, worked in whole numbers a
  float cannot get wrong). Each priced Dispatch then owes all its share, by the day he pays by: his **Receivable**,
  which the existing Receivable Payment clears. No Money Event is written: nothing was paid at the gate.
- **Owed from the statement's date.** A statement-priced Dispatch left the farm on its own day but became owed on the
  statement's date. His payments clear what he owes in the order it became owed — a Sale or a Dispatch from the day it
  left, statement-priced milk from its statement's date — so a payment made before the statement went to what he owed
  then (the milk he took on credit at a price), never to milk nobody had priced; and read as at a day before the
  statement's date — a month's end, the accountant's day — that milk is not yet owed. The statement's date rather than
  the day it was typed in: it is the buyer's own word of when he owes it, and a statement entered late is no less
  owed from then. Its age and overdue still count from the day it left and the day he pays by.
  Milk priced at the gate is left as it was; where none of the statement's milk was to follow, his amount is only
  compared with what the farm priced, and the difference said. An amount no more than the milk already priced at the
  gate, with milk to follow, is refused (`statement_below_priced`): the gate prices are put right first.
- **What a statement priced, it holds.** Its Dispatches keep a price of nothing and name the statement; what each came
  to is its share. A Correction may not change when one left, its liters, its buyer, its price or its money while the
  statement stands (`priced_by_statement`); its notes, Delivery Note, fat and SNF stay the Manager's to put right, and
  putting them right leaves what he owes as the statement set it. Milk
  with its price to follow is not sent to a buyer into days his standing statement covers (`statement_covers_it`):
  priced at the gate it may be, and it is compared.
- **A wrong statement is voided by the Owner, with a reason**, never deleted. The milk it priced goes back to its price
  to follow, owing nothing, and its overdue notices are dismissed; the voided statement stays on the list, marked, with
  the reason. Refused while his payments have cleared any of that milk, or some was written off
  (`statement_paid_on`): the payment or the Write-off is put right first, as a Dispatch's are (the Owner, 2026-10-07).
  A statement is not corrected in place: voided, and the right one recorded.
- **A Closed Month (ADR 0028).** The milk a statement prices is money of the month it left in, as a Dispatch's is. A
  statement that prices milk of a month the Owner has closed, or voids one that did, is hers alone (`month_closed` to
  anybody else); hers is kept under "Changed after closing" for each closed month it touched, by the buyer, as
  `buyer_statement`, with what the month held of it before and after. Milk and cattle left owing on credit answer to a
  closed month the same way (ADR 0028 addendum), and so does a Correction that gives milk to follow a price.
- **A Correction may send a price to follow, or give one.** A price put on milk whose price was to follow leaves it all
  owed unless the Correction says he paid at the gate; a guessed price taken off sends it back to follow, refused while
  anything said paid at the gate stands — say it was nothing first.
- **Late.** Milk with its price to follow is late ten days after the end of the buyer's statement period it falls in:
  periods as long as his last standing statement's, stepping on from its last day (and back from it, for older milk),
  or the calendar month while he has sent none. Counted from the period's end, not the day it left, milk sent on the
  last day of a period is late on the same day as milk sent on its first. The Manager's home and
  the Owner's say so, with the way to the Statements tab, and the Owner's "all fine" waits on it as it waits on overdue
  supplier balances. No notice is pushed: a late statement is a call to the center, not an emergency.

## Every reader of a Dispatch's money

- What a Dispatch came to is read in one place (`worthOfMilkSent`, in the domain, which the farm and the screen both
  read): liters at the price, or its statement's share, or nothing while the price is to follow. What a liter fetched (`fetchedPerLiter`) is nothing for such milk.
- **The Monthly Report**, its paper and its CSV: milk sold, liters sold and what a liter fetched count only priced milk;
  the milk still to follow is a line of its own, "Liters, price to follow" / «দাম পরে ঠিক হবে এমন দুধ», shown only in a
  month that sent some, and the paper says it is in no money above. Priced by a statement later, the milk counts in the
  month it left. Side Results, margins and Capital read the same figure.
- **The cull list's milk price and the dairy returns' monthly milk prices** average priced milk only: milk nobody has
  priced is no price.
- **The milk page**: the day's money leaves it out and says its liters beside ("N L price to follow"); each Dispatch
  says "Price to follow", or its statement's rate "by statement".
- **Receivable, its ages and overdue, the money book and the accountant's exports** read Receivable and Money Events
  only, so milk to follow is in none of them until its statement prices it — then it is Receivable that left on its
  own day and is owed from the statement's date (above).
- **The dispatch record** (Safe Food Act) never printed a price, and does not now.

## Why

- Pricing by liters' share rather than by each can's own fat and SNF: the statement gives one amount, and the farm
  cannot know the center's rate card; its own fat and SNF are kept on each Dispatch for the Owner to read beside the
  statement's averages.
- A Receivable rather than a new kind of debt: the center owes for milk taken on credit, which is what a Receivable is,
  and the payment, write-off, ages and overdue machinery already answer for it.
- Void-and-record rather than correcting a statement in place: a statement is the buyer's paper, recorded as it came;
  a wrong one is a different paper, and the trail keeps both.
- Refused overlap rather than one statement per calendar month: centers pay fortnightly or monthly on their own days.

## Consequences

- The milk money a month says can grow after it ends, when its statement comes; until then the report says how many
  liters are waiting. A closed month's grows only by the Owner's hand, and is listed.
- A Manager who guessed prices before this can send them back to follow by Correction, where nothing was paid.
- A buyer under several Counterparty names compared alike is one buyer to statements and to milk waiting for its
  price; his Receivable stays on each name it was booked to, as before.
- A buyer who has paid at the gate cannot be switched to price to follow at once: enough of his recent Dispatches go
  on credit first to make credit his terms. The Correction that sends a guessed price back to follow does not ask this.
