# OpenFarm investor-funded Ventures — spec

Status: ready-for-agent

Source: the wayfinder map [`map.md`](./map.md) (10 of 12 tickets resolved, 2026-09-18), its tickets in [`issues/`](./issues/), the roles matrix in [`assets/`](./assets/), the glossary [`CONTEXT.md`](../../CONTEXT.md), the research on branches `research/bangladesh-pooled-investment` and `research/cattle-investment-schemes`, and the statement prototype on `prototype/investor-statements`. Where this spec and a ticket's Answer disagree, the ticket wins and this spec has a bug. Vocabulary is the glossary's; capitalised terms are defined there.

**Two tickets are open by design.** [Take the structure to a lawyer and a Shariah scholar](./issues/11-take-the-structure-to-a-lawyer-and-a-shariah-scholar.md) and [What the advisers' answers change](./issues/12-what-the-advisers-answers-change.md). Everything below about the **wording** of an Investment Agreement, the **twenty-Investor cap**, and **tax** is provisional until they answer. Nothing below waits on them to be built: the cap is a Farm Parameter, and the agreement is a stored photo rather than generated text.

---

## Problem Statement

The Farm has sheds, staff, feed contracts and the skill to fatten cattle, but not the cash to fill the sheds for an Eid. People the Owner knows do have cash and want a share of what fattening makes. The arrangement is easy to describe and hard to keep honest: investors' money buys the cattle, feed and medicine; the Farm provides the sheds, the staff, the electricity and the water; profit or loss is shared by contract.

Kept on paper it fails in four ways. **Whose money bought which bull** is remembered rather than recorded, so an Investor cannot be shown that the animal they funded is the one in the photo. **What the animals actually cost** is guesswork, because feed goes to mixed Pens where the Farm's own cattle stand beside two Ventures' cattle, and nobody can split a sack of feed after the fact. **The money mixes**: investors' capital lands in the same pocket as milk money, so the Farm's own income and expense record — which the accountant works from and OpenFarm already keeps — silently counts money that was never the Farm's. And **the law is unforgiving**: in Bangladesh, taking money from the public with a promise of capital back or a fixed return is banking business with prison attached, and the cattle-investment apps that promised monthly returns were shut down. An arrangement the Owner cannot document is an arrangement the Owner cannot defend — to an investor who feels short-changed, to a relative asking why the bull sold for less than expected, or to a regulator.

## Solution

A **Venture** in OpenFarm: one investor-funded run of fattening cattle, from the first capital in to the last payout. Investors hold fixed-price **Units** under a stamped **Investment Agreement** signed per Venture; their capital sits in a dedicated **Venture Account**, planned as a **Cattle Budget** and a **Running Budget**. Cattle are bought with a **Buying Float** drawn for one Buying Trip and reconciled when it returns; every Intake names the owner of the animal — a Venture, or the Farm — and one owner owns her at a time.

The Venture's cattle stand in the Farm's ordinary Pens and are worked by the Farm's ordinary SOPs; **Barn Staff never see whose money bought an animal**. What changes is costing: every Animal on the farm now carries her share of the feed she ate at a price that includes home-grown fodder, the **Hasil** paid on her at the haat, her share of the **Buying Trip** that brought her and the **Selling Trips** that took her, and her share of the **Herd Costs** the Owner has marked as charged. A Venture's cost is the sum of its Animals' costs. Wages, utilities, repairs, shed hygiene, equipment and feed lost from the store stay the Farm's, and are how the Farm earns its share.

Every **Money Event** now names its **Purse** — the Farm's money, or one Venture's — so the Farm's monthly reports and the accountant export read the Farm's purse alone and investors' capital is never counted as the Farm's income. The Farm buys feed and medicine for the whole herd as it does today, and each month one **Reimbursement** moves each Venture's consumption from its Venture Account to the Farm's.

At the end, a **Settlement**: proceeds less everything the Venture was charged is the profit; the Owner's **Advance** is repaid at cost from the Venture's cash, capital returns whole, and what is left splits 60 : 40 to Investors and Farm by the percentages that Venture's agreements froze, divided by Units held. A loss comes off capital the same way. The Owner's approval freezes the figures; anything arriving afterwards is a **Settlement Adjustment**.

Investors get **documents, never logins**: an acknowledgement when their capital lands, a monthly progress statement with photos and weights, and a settlement statement. OpenFarm is an internal ledger and a statement printer — no sign-up, no "invest now", no payment collection, no referrals, and **no projected return anywhere**.

## User Stories

### Investors and their agreements

1. As an Owner, I want to record an Investor with name, phone, address, NID, bank account and a nominee, so that I can pay them and their family knows what they held.
2. As an Owner, I want one Investor record reused across Ventures, so that a man who joins three runs is one person in the records.
3. As an Owner, I want to attach a photo of the stamped Investment Agreement with its stamp value, date and serial, so that what we signed is on file for as long as it matters.
4. As an Owner, I want the system to refuse to record capital against a Venture until that photo is there, so that no money is taken on a handshake.
5. As an Owner, I want an Investment Agreement to belong to one Investor and one Venture, so that each run is signed for afresh.
6. As an Owner, I want the agreement to hold the Units taken, the split percentages, the Target Window and the named Arbitrator, so that the terms are readable years later without finding the paper.
7. As an Owner, I want percentages and window frozen once the Venture is open, and changed only by a dated amendment signed by every Investor in that Venture, so that nobody's deal moves under them.
8. As an Owner, I want an amendment stored as its own photo beside the original and the system to show which terms were in force when, so that a dispute has an answer.
9. As an Owner, I want to be warned as a Venture's Investors reach fifteen and refused a twenty-first across all unsettled Ventures, myself included, so that the arrangement never becomes a company by accident.
10. As an Owner, I want the cap to be a Farm Parameter, so that a lawyer's answer changes a number rather than the code.
11. As an Owner, I want my own capital recorded as an Investor's, earning the Investors' share pro rata and bearing loss the same way, so that my money is treated like anybody's.
12. As an Owner, I want the Farm's management share shown as its own line wherever my Investor payout is shown, so that the two are never confused.

### A Venture and its money

13. As an Owner, I want to open a Venture with a name, a target capital, a Floor, a decision date, a Target Window, a unit price and a number of Units, so that what we are raising is written down before anybody pays.
14. As an Owner, I want capital planned as a Cattle Budget and a Running Budget, so that feed money is not spent on one more bull.
15. As an Owner, I want to record capital received against an Investor's Units with the date and the bank reference, so that every taka in has a trail.
16. As an Owner, I want the system to refuse capital in any form but a bank transfer, cheque or deposit slip, so that no cash arrives that nobody can prove.
17. As an Owner, I want a Venture that reaches its Floor by its decision date to move to Buying, so that we start when we have enough.
18. As an Owner, I want a Venture that misses its Floor to refund every taka through the Venture Account and end Cancelled, so that nobody's money sits in a run that never happened.
19. As an Owner, I want no new Investor and no top-up once buying starts, so that every Investor's share is fixed for the run.
20. As an Owner, I want unspent Cattle Budget to roll into the Running Budget when buying closes, so that leftover money feeds the animals rather than idling.
21. As an Owner, I want to see, per Venture, capital in, spent, reimbursed, paid out and the balance the Venture Account should hold, split across both budgets, so that I know where the money is.
22. As an Owner, I want a warning when the Running Budget falls below a level I set, so that an Advance is a decision rather than a surprise.
23. As an Owner, I want to record an Advance of my own money to a Venture, interest-free, so that the animals keep eating when the Running Budget runs out.
24. As an Owner, I want an Advance repaid at cost before capital returns and never earning anything, so that it stays a favour and not a loan with a return.
25. As an Owner, I want to record the Venture Account's real bank balance each month and be told when it disagrees with what OpenFarm says, so that a mistake is caught in weeks rather than at settlement.

### Buying the cattle

26. As an Owner, I want to draw a Buying Float from a Venture Account for one Buying Trip, so that the Manager goes to the haat with money that is accounted for.
27. As a Manager, I want to record each Intake against the Float with the animal's price and her Hasil, so that what the money bought is written down at the haat.
28. As a Manager, I want to record the Trip's own costs — broker, lorry, the men's food and lodging — once for the trip, so that they are not typed per animal.
29. As an Owner, I want the Float reconciled when it returns: float out equals the animals, plus the Trip's costs, plus the cash deposited back, so that nothing goes missing between the haat and the shed.
30. As a Manager, I want every Intake to name its owner — a Venture or the Farm — so that no animal is unowned.
31. As a Manager, I want a mistaken owner put right inside the ordinary Correction Window, so that a slip at the haat is fixable without a story.
32. As an Owner, I want an Animal to have exactly one owner at a time and no silent drift between owners, so that an Investor's animal cannot quietly become mine.
33. As an Owner, I want to sell an Animal between the Farm's herd and a Venture as an Internal Sale, priced at her latest Weigh-in times a live-weight rate I enter with a note of where it came from, so that value moves at a price I can defend.
34. As an Owner, I want the money for an Internal Sale to actually move through the Venture Account, so that it is a sale and not a book entry.
35. As an Owner, I want an Internal Sale refused once the Venture is Selling or the Animal is Ready for Sale, so that a finished bull cannot be lifted out of the pool.
36. As an Owner, I want every Internal Sale to be mine alone and audited, so that nobody else can move animals between the purses.

### What a Venture is charged

37. As an Owner, I want each home-grown Feed Item to carry a Fodder Price per kg that I set, so that fodder from my fields is charged like bought feed rather than given away.
38. As an Owner, I want a Harvest to enter the store at that price and join the weighted average, so that a Pen fed a mix is charged what the mix is worth.
39. As an Owner, I want the same costing to apply to the Farm's own animals, so that a Venture's result and mine are comparable and nothing can be moved between them by choosing how to count.
40. As an Owner, I want a Buying Trip's costs split evenly across the Animals it brought home, and the Hasil charged to the Animal it was paid on, so that each beast carries what she actually cost to fetch.
41. As an Owner, I want a Selling Trip's costs split evenly across every Animal taken, sold or brought home again, so that a bull that came back still pays for her place on the lorry.
42. As an Owner, I want to mark a Category once as charged to the animals of its Side, so that a vet visit naming nobody or a drum of fly spray reaches the animals without the Manager deciding case by case.
43. As a Manager, I want to keep entering money by hand exactly as I do now, picking a Category and a Side, so that nothing about my day changes.
44. As an Owner, I want Herd Costs split across the Animals of their Side by the days each stood on the farm that month, so that an animal that arrived on the 20th pays for ten days and not for thirty.
45. As an Owner, I want wages, electricity, water, repairs, shed hygiene and equipment never charged to any Animal, so that the Farm's side of the bargain stays the Farm's.
46. As an Owner, I want equipment bought because a Venture needed it to stay the Farm's, so that the sheds keep what they gain.
47. As an Owner, I want feed lost from the store, as the Stock Count finds it, to stay the Farm's, so that an Investor never pays for a careless storekeeper.
48. As an Owner, I want a Venture's spend worked out from the records whenever I look, so that a Correction flows through rather than needing a rebuild.
49. As an Owner, I want unpriced feed and uncosted doses on a Venture's Animals shown as holes to fill, so that I know what is missing before it matters.
50. As an Owner, I want a Venture's Margin and Cost of Gain to read per animal and per Venture, so that I can see which bull earned and which did not.

### Two purses

51. As an Owner, I want every Money Event to name its Purse — the Farm's or one Venture's — so that the two never mix.
52. As an Owner, I want the Farm's period reports and the accountant export to read the Farm's purse alone, so that my books show my money.
53. As an Owner, I want capital in, refunds, Advances and payouts recorded against the Venture and never as the Farm's income or expense, so that money that was never mine is never counted as mine.
54. As an Owner, I want the Farm's management share at settlement to enter the Farm's books as income, so that what the Farm earned is in the Farm's accounts.
55. As an Owner, I want the Farm to buy feed and medicine for the whole herd as it does today, so that buying does not fragment by purse.
56. As an Owner, I want a monthly Reimbursement moving each Venture's consumption from its Venture Account to the Farm's, so that the purses come right once a month without splitting sacks.
57. As an Owner, I want a Reimbursement to show what it is made of — which Feed Items, which doses, which Herd Costs — so that I can explain it to an Investor.

### Selling, wind-up and settlement

58. As a Manager, I want to sell a Venture's Animals exactly as I sell the Farm's, with the same Receipt and Transport Card, so that a buyer at the haat sees no difference.
59. As an Owner, I want a Venture to reach Selling on its first Sale and Settled on its last payout, without my having to remember to move it, so that its state is a fact rather than a chore.
60. As an Owner, I want a Wind-up Period of a set number of days after the Target Window, so that a slow bull does not hold up everybody's money.
61. As an Owner, I want to buy whatever is unsold at the end of the Wind-up Period as an Internal Sale at weight, so that the Venture can settle on time.
62. As an Owner, I want settlement refused while an Animal still stands, a price is missing, a Buying Float is unreconciled, a Reimbursement is untransferred or the bank disagrees, so that a settlement is never a guess.
63. As an Owner, I want the settlement to show proceeds, every charge as its own line, the Advance repaid, capital returned and the profit, so that an Investor can follow it.
64. As an Owner, I want profit split by the percentages that Venture froze and divided by Units held, so that the arithmetic matches the paper.
65. As an Owner, I want each Investor's payout rounded down to whole taka and the remainder shown as a line to the Farm, so that nothing is paid out that the account does not hold.
66. As an Owner, I want a loss to come off capital by Units held and be shown plainly, so that an Investor learns it from the statement rather than from a rumour.
67. As an Owner, I want an Advance repaid before capital returns even when the Venture lost money, so that money I put in to feed their animals comes back before their capital does.
68. As an Owner, I want to approve the settlement as one act that freezes the figures, so that the numbers an Investor is shown cannot drift afterwards.
69. As an Owner, I want each payout recorded with its bank reference, so that "I never got it" has an answer.
70. As an Owner, I want to record an Investor's acknowledgement when it arrives, so that the file shows who has confirmed.
71. As an Owner, I want a late Correction or cost to become a Settlement Adjustment rather than reopening the settlement, so that money already paid is not chased.
72. As an Owner, I want an Adjustment above an amount I set to require a supplementary payout or a recorded waiver, and below it to be noted only, so that small change does not cost a bank trip.
73. As an Owner, I want a Venture's whole settlement record kept for at least twelve years and never deleted, so that a dispute years later meets the evidence.

### What an Investor receives

74. As an Investor, I want an acknowledgement when my capital lands, showing my Units, the amount, the date and the bank reference, so that I know the Farm has it.
75. As an Investor, I want the terms in plain Bangla on that same paper, so that I know what I have agreed to without reading the stamped deed again.
76. As an Investor, I want a monthly progress statement with head alive and died, weights then and now, daily gain and days to the window, so that I can see how my animals are doing.
77. As an Investor, I want a photo of each animal on it, so that I can see the cattle I paid for without going to the shed.
78. As an Investor, I want the Venture's spend by Category against its budgets, so that I know where my money went.
79. As an Investor, I want a statement when buying closes, at the first Sale and when the Wind-up Period starts, so that I hear at the moments that matter.
80. As an Investor, I want a settlement statement showing proceeds, charges, profit, the split, my Units' share, the rounding and my payout, so that I can check it myself.
81. As an Investor, I want to see what happened to the herd — bought, average price, sold, average price, bought back, died — so that the result has a story.
82. As an Investor, I want no projected price or return anywhere on any paper, so that nobody is promising me something they cannot know.
83. As an Investor, I want every sheet to say that no return is guaranteed and a loss comes off capital, so that the terms are in front of me every time.
84. As an Investor, I want never to see another Investor's name or holding, so that my neighbour's business stays his.
85. As an Owner, I want every statement to be an Export with an Audit Event, so that the Farm knows what it sent and when.

### Who may do what

86. As an Owner, I want opening a Venture, the Investor records, capital, refunds, the Float, Reimbursements, the bank check, Advances, Internal Sales, settlement, payouts, statements and Adjustments to be mine alone, so that the money side is not delegated.
87. As a Manager, I want to record Intakes, Hasil, trip costs and Sales for a Venture's animals as I do for the Farm's, so that my work is unchanged.
88. As a Manager, I want to see which Venture owns an Animal, its budgets, its spend and its warnings, so that I can run the shed and tell the Owner when money is short.
89. As a Manager, I want never to see Investors, Units, the split or a Venture's result, so that the Farm's money conversations stay with the Owner.
90. As Barn Staff, I want to see nothing of Ventures at all, so that an Investor's bull is treated exactly like any other animal.
91. As a Vet, I want to see nothing of Ventures, so that clinical work stays clinical.
92. As an Owner, I want no new approval queue, since every Venture money act is already mine, so that nothing waits on me twice.
93. As a Manager, I want my ordinary thirty-day Correction Window on what I recorded, so that a wrong trip cost is fixable.
94. As an Owner, I want approving a settlement to freeze every record in that Venture against correction, so that the frozen figures stay true.
95. As an Owner, I want every Venture act in the Audit Event trail with the Role used, so that the trail covers the money as it covers the animals.

### Guardrails the law puts on the software

96. As an Owner, I want no sign-up page, no "invest now", no payment collection and no referral feature anywhere in OpenFarm, so that the Farm is not running an investment platform.
97. As an Owner, I want the system to refuse to state or store a promised or projected return, so that no screen or paper can be read as a guarantee.
98. As an Owner, I want an Investor's result to be able to be negative everywhere it is shown, so that the software never implies capital is safe.
99. As an Owner, I want Venture records, payments and statements kept at least twelve years, so that the retention the law expects is met.
100.  As an Owner, I want the Investor cap, the Wind-up Period, the default split, the Floor percentage, the Running Budget share and the Adjustment threshold to be Farm Parameters, so that an adviser's answer is a setting rather than a release.

## Implementation Decisions

### Shape

**Nothing of this exists yet.** The vocabulary is in the glossary and none of it is in the code: no Venture, Investor or Purse anywhere, and two of the glossary's own entries — the Fodder Price on a Harvest, and a Category marked as charged to the animals — describe behaviour today's costing does not have. Increment 1 closes that gap; the rest is new.

- One new schema module, `venture`, beside the existing ones, holding the Venture, the Investor, the Investment Agreement and its amendments, Unit holdings, the Venture's money movements, the Settlement and its Adjustments, and the Buying and Selling Trips. Trips are not Venture-specific — a Trip may carry the Farm's animals and two Ventures' — so they live here only because they arrive with this work; they are farm records like any other.
- **The Venture's states** are `open`, `buying`, `fattening`, `selling`, `settled`, `cancelled`. The Owner moves `open → buying` (refused below the Floor) and `buying → fattening`; the first Sale of one of its Animals moves it to `selling`; the last payout of its Settlement moves it to `settled`; `open → cancelled` is the Owner's act and refunds every capital movement.
- **An Investor is not a Counterparty.** A Counterparty is paid for something; an Investor shares what the Farm makes. Separate table, its own record of NID, bank account and nominee.
- **Units, not amounts.** A Venture declares a unit price and a count. An Investment Agreement records the Units taken by one Investor in one Venture; capital received is checked against Units × unit price. Everything downstream divides by Units.
- **Amendments** are rows against an Investment Agreement carrying the changed terms, the date, and the photo; the agreement in force at a time is the latest amendment on or before it. The original is never edited.
- **The agreement photo** is stored as the existing records store photos, and `capital_in` is refused without one.
- **The cap** counts distinct Investors across Ventures not `settled` or `cancelled`, the Owner included: warn at the warning parameter, refuse past the cap parameter, with a typed error the screen can word. No override.

### Money and the Purse

- The Money Event gains a **purse**: null for the Farm, or the Venture whose money it was — the same shape the existing Side column already uses for "the whole farm". Every existing row reads as the Farm's, so nothing about the accountant export changes for what is already recorded.
- **One door**: every record's money is already booked through a single store function that upserts on (source, source id), so the purse is carried on the booking that function takes and set by the record that knows it — an Intake of a Venture's Animal, a Sale of one. Nothing else may write a Money Event.
- New money **sources** and **Categories** arrive with this work: the Reimbursement, and the Farm's management share at Settlement.
- Every existing reader of `money_event` — the period report, the accountant export, the Owner's money tiles, the wage rule — filters to the Farm's purse. A Venture's own spend is read by Venture.
- **Capital in, refunds, Advances, Advance repayments and payouts are not Money Events.** They are movements of a Venture's own money, recorded against the Venture, because a Money Event is the Farm's income or expense and none of these are.
- **A Reimbursement is both**: a movement out of the Venture, and a Money Event **in** on the Farm's purse under its own Category. Gross, not netted: the Farm's expense when it bought the feed stands, and the Farm's income when a Venture repays its share stands beside it. This also settles home-grown fodder, which the Farm never paid cash for and is genuinely selling — the Fodder Price charged to a Venture's Animals comes back as Farm income through this one door.
- **The Farm's management share** at settlement is the one Money Event settlement writes: money in, the Farm's purse, its own Category, sourced from the Settlement.
- **Payment method** on a capital movement is restricted to bank; cash and bKash are refused.
- `money_category` gains **charged to the animals of its Side**, the Owner's mark, defaulting off for the standard Categories except the ones the Owner turns on. Changing the mark is the Owner's and audited; it changes what future reads charge, and the read is by month, so a changed mark reprices the months it covers — accepted, because the alternative is a stored cost nobody can correct.

### Costing, widened for every Animal

- The Feed Item gains a **Fodder Price** per kg, set by the Owner. A Harvest takes the Fodder Price in force when it is recorded — the price comes from the Feed Item, not from what the person typed — and from then on it is an ordinary priced lot in the weighted average, where today a Harvest enters at no price and dilutes the average toward nothing. **A Harvest still makes no Money Event**: no money moved, and the farm's cash did not change. What the Fodder Price does is charge the animals that eat it, and a Venture's share of that comes back to the Farm as a Reimbursement. Harvests recorded before this ships keep their zero price; the change is not retrospective, and the report says so.
- **Hasil** is a column on the Intake, charged to that Animal alone.
- **A Buying Trip** carries its costs once and is charged evenly across the Animals whose Intakes name it. **A Selling Trip** carries its costs once and is charged evenly across the Animals taken on it, which is a list recorded when the trip goes, not derived from the Sales that followed.
- **Herd Costs**: for a month and a Side, the marked Categories' hand-entered Money Events of that Side, split across the Animals of that Side by their days standing on the farm in that month, from the Pen history the cost store already builds.
- `Costs` grows `hasilBdt`, `tripBdt` and `herdBdt` beside `feedBdt`, `medicineBdt` and `vetBdt`; `Margin`, `Cost of Gain` and `Cost per Litre` all read the wider sum. **A Venture's cost is the sum of its Animals' costs** plus nothing else, so there is one costing and no second path.
- The cost store loads by Farm and period as it does today, with the Venture's Animals as a filter rather than a separate loader.

### Buying, and the Float

- A **Buying Float** is drawn from a Venture, recorded as a movement, and reconciled by: Float out = Σ (Intake price + Hasil) + Trip costs + cash returned. Reconciliation is a recorded act with the deposit slip's reference; an unreconciled Float blocks settlement.
- **Animal ownership** is a column on the Animal, set by her Intake, correctable within the window, and otherwise changed only by an **Internal Sale**, which records both sides, the weight it was priced on, the rate, the note, the Owner as actor, and moves money through the Venture Account. Refused when the Venture is `selling` or the Animal is Ready for Sale.
- An Animal born on the Farm is the Farm's; a Venture only ever owns bought-in Fattening Animals.

### Settlement

- Settlement is computed, shown, then **frozen** on the Owner's approval: the computed figures are written into the Settlement row as they stood, because the whole point is that they cannot drift.

```
  proceeds  = Σ Sales of its Animals + Σ Internal Sales out
  charged   = Σ its Animals' costs (purchase + Hasil + Trips + feed + doses + vet + Herd Costs)
  profit    = proceeds − charged                         // may be negative
  investors = round(profit × investorsPct / 100)
  perUnit   = floor(investors / units)                   // whole taka
  rounding  = investors − perUnit × units                // goes to the Farm
  farm      = profit − investors + rounding
  payout(i) = capital(i) + perUnit × units(i)            // capital returns whole beside the profit
```

The Advance is repaid at cost out of the Venture's cash before capital returns; it is not a charge, because the costs it paid are already in `charged`. Unspent Running Budget is not added either: it is capital never spent, and returns as capital. (Corrected on 2026-09-18 — the first version of this sum double-counted; the prototype caught it.)

- **Blocked** while: an Animal of the Venture is still standing; any of its Animals carries unpriced feed or an uncosted dose; a Buying Float is unreconciled; a Reimbursement is owed; the last recorded bank balance disagrees with the computed balance.
- **Settlement Adjustment** rows hang off the Settlement, each carrying what changed, the revised per-Investor figures and whether it was paid, waived or noted. Approving a Settlement makes its Venture's records refuse Corrections; a Correction attempted afterwards returns the typed refusal that says to raise an Adjustment.

### Statements

- Three documents through the existing document surface, the way the fifteen Release 1 papers are generated: **joining**, **progress**, **settlement**. A4, Bangla with English labels, on the Farm Identity letterhead with the Registration number, each carrying the "no guaranteed return, loss comes off capital" footer in both languages. Shapes are settled by the prototype on `prototype/investor-statements`; the verdict is on [the prototype ticket](./issues/08-prototype-investor-statements.md).
- Generating one is an **Export** with an Audit Event, as every other document is. Each is for one Investor and shows no other Investor.
- **No projection** is computed or printed: weights, gains and days are facts; a future price is not.

### Roles

- No new Role. The matrix is [`assets/venture-roles-matrix.md`](./assets/venture-roles-matrix.md): the Owner holds every money act; the Manager records Intakes, Hasil, trip costs and Sales, and reads a Venture's budgets, spend and warnings; Staff and Vets see nothing of Ventures, including on the Animal's own page.
- Every Venture write carries an Audit Event with the Role used, in the same transaction, as ADR 0002's write path requires.

### Farm Parameters

Investor cap (20) and its warning level (15), Wind-up Period (30 days), default split (60 : 40), Floor as a percentage of target capital, the Running Budget's share of capital, the Running Budget's low-water mark, and the Settlement Adjustment threshold.

### An ADR to write

**Investors' money is not the Farm's income: a Money Event names its Purse.** It changes what every money reader means, it is the decision most likely to be questioned later, and Release 1's "an income and expense record, not a ledger" needs the amendment written down beside it.

### Sequencing

1. **Costing, widened** — Fodder Price, Hasil, Buying and Selling Trips, Herd Costs and the Category mark; Margin, Cost of Gain and Cost per Litre read the wider sum. No Venture anywhere. Ships on its own and improves the Farm's own numbers.
2. **The Venture, its Investors and its capital** — the tables, the states, agreements and amendments, Units, capital in, refunds, the cap, the balance and its warnings, the Purse on Money Events with every reader filtered.
3. **Buying** — the Buying Float and its reconciliation, ownership on the Animal set at Intake, the Internal Sale and its bars.
4. **Living** — monthly Reimbursement and what it is made of, the Running Budget warning, the Advance, the monthly bank check, the Venture's spend and holes.
5. **Ending** — Selling, the Wind-up Period, the buy-back, the Settlement with its blocks, approval, payouts, acknowledgements and Adjustments.
6. **The statements** — the three documents, their Exports and their audit.

## Testing Decisions

- A good test drives the system through the seam a user of that seam would use and asserts only what is observable from outside — a response, a row, an Audit Event, a refusal — never how a module got there. Tests read like the user stories above.
- **One seam: the oRPC router, in-process** (confirmed with the Owner, 2026-09-18). Tests call procedures through `createTestClient` with a Role context and a `FakeClock`, against the scratch PostgreSQL the harness starts. The settlement arithmetic is asserted through the procedure that computes it, with figures chosen so the rounding remainder is not zero and so one Venture ends in loss.
- No new test package and no new convention. Where a pure helper is worth exercising on its own — the animal-days split, the per-Unit floor — its test sits beside the existing database-free tests in the api package, as the Pen-history test does today. `packages/domain` has no test runner and gains none.
- **A test Farm per file** (`theFarm`, `thePerson`), as every api test file has done since 2026-09-16; the database is shared, so nothing may assume an empty table.
- What is asserted at that seam: capital refused without the agreement photo and refused in cash; the cap warning and the refusal of a twenty-first Investor across two unsettled Ventures; a Venture under its Floor cancelling and refunding; Units fixed once buying starts; a Buying Float that does not reconcile; ownership set at Intake and corrected inside the window; an Internal Sale priced from the latest Weigh-in, and refused once the Venture is `selling` or the Animal is Ready for Sale; a Harvest costing its Fodder Price and an older zero-priced Harvest still costing nothing; Hasil charged to one Animal; a Buying Trip split across the Animals it brought and a Selling Trip across the Animals taken, one of which came home; Herd Costs split by animal-days across a month an Animal only partly stood in; a marked Category reaching animals and an unmarked one reaching nobody; store loss charged to nobody; the Purse keeping a Venture's spend out of the period report and the accountant export; a Reimbursement moving exactly what its Animals consumed; settlement refused for each of its five loose ends in turn; the split, the per-Unit floor and the remainder to the Farm; a loss coming off capital; an Advance repaid before capital in both a profit and a loss; approval freezing the figures and a later Correction refused in favour of an Adjustment; the roles matrix row by row, including a Manager reading budgets but not Investors and Staff seeing no Venture on an Animal's page; an Audit Event for each money act with the Role used; and a statement generated as an Export showing one Investor only.
- **Prior art**: `packages/api/src/routers/costs.test.ts` for costing through a period, `money.test.ts` and `money-entries.test.ts` for Money Events and approvals, `intake.test.ts` and `sale.test.ts` for the fattening records, `feed.test.ts` for stock and prices, `papers.test.ts` for a generated document, `corrections.test.ts` for windows and refusals.
- **Not tested**: PDF layout (assert content), the bank itself, and anything about what an adviser may later say.

## Out of Scope

- **An Investor portal or login.** Documents only; a read-only portal is a later effort, and the lawyer must clear it first.
- **Dairy Ventures.** Investor money funds Fattening only.
- **Sign-up, online pay-in, payment gateways and referral schemes.** Forbidden by the law research, not merely deferred.
- **Insurance on Venture cattle.** Decided against: a dead Animal is the Venture's loss.
- **Investors living abroad**, and the foreign-exchange questions they bring.
- **Tax withholding and any VAT treatment** until the advisers answer; the spec holds no withholding logic.
- **Generating the Investment Agreement text.** OpenFarm stores the stamped paper's photo and its terms as data; the deed itself is drafted off-system by the lawyer.
- **A second Farm**, unchanged from Release 1's position.

## Further Notes

- The two open map tickets are the only outstanding decisions; both are about advice rather than software, and their answers change Farm Parameters, the agreement's wording and possibly tax — not the shape built here.
- The research notes are on `research/bangladesh-pooled-investment` (what the law allows, with citations) and `research/cattle-investment-schemes` (what other schemes publish). Both label what could not be verified.
- The statement prototype is on `prototype/investor-statements` (`/prototype/investor-statement?variant=A|B|C`) and as a canvas at https://claude.ai/artifact/FifJiMPFWJpfJQ5RRVkZ6h. It is throwaway; the documents get built properly.
- Increment 1 is worth shipping even if no Venture ever opens, and is the only part that cannot be affected by the advisers.
