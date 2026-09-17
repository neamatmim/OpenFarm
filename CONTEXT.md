# OpenFarm

An SOP-driven operations system for a single cattle farm in Bangladesh that both produces milk and fattens cattle for sale. It holds the farm's records and enforces the farm's standard procedures.

## Language

**Farm**: The single operating unit the system serves today — one owner, one set of records, one set of SOPs. Modelled so a second Farm could exist later, but only one exists now. _Avoid_: Tenant, organisation, account

**SOP**: A standard operating procedure — a written, versioned procedure the farm expects staff to follow, which the system turns into scheduled or triggered work and records who completed it. _Avoid_: Playbook, protocol, checklist (a checklist is one _form_ an SOP step can take, not the SOP itself)

**Playbook**: The farm's full set of SOPs taken together. Refers to the collection, never to an individual procedure.

**Dairy**: The side of the farm that keeps cows for milk. _Avoid_: Milk production, milking (milking is an activity within Dairy)

**Fattening**: The side of the farm that buys or raises cattle to gain weight and sells them for beef. _Avoid_: Beef, finishing, feedlot

**Release 1**: The first version of OpenFarm the farm will run. This map ends in its spec. _Avoid_: MVP, v1, phase 1

## People

**Owner**: The person who owns the Farm, sets the Playbook, and can see and approve everything — and may do anything the Farm Manager does, recording and signing off included. A Vet's clinical acts stay the Vet's. _Avoid_: Admin, boss

**Farm Manager**: The person who runs the Farm day to day: assigns SOP work, signs it off, and keeps the records honest. _Avoid_: Supervisor, admin

**Barn Staff**: The people who do SOP work at the animal — milkers, feeders, herdsmen. They record on phones, often without signal. _Avoid_: Worker, labourer, operator

**Vet**: A veterinarian or para-vet, in-house or visiting, who diagnoses, prescribes, and records treatments. _Avoid_: Doctor, animal health worker

## Animals

**Animal**: One individual head of cattle the Farm is responsible for, from arrival or birth until sale or death. Belongs to Dairy or Fattening at any given time. _Avoid_: Cow (a cow is a female that has calved — a specific kind of Animal), head, stock

**Tag Number**: An Animal's permanent identity: a side-of-origin prefix and a running number (`D-0001`, `F-0001`), assigned at birth or intake, never reused, unchanged if the Animal changes Side. _Avoid_: ID, animal number, ear-tag number

**Ear Tag**: The physical tag carrying the Tag Number. Can be lost and replaced; a replacement carries the same Tag Number and the Re-tag is recorded. _Avoid_: Tag (ambiguous with Tag Number)

**Official Tag**: Any government or pilot-scheme tag an Animal also carries. Recorded as an attribute; never the identity. _Avoid_: Government ID, national ID

**Re-tag**: The recorded event of replacing a lost or unreadable Ear Tag with one carrying the same Tag Number. _Avoid_: Re-numbering (which never happens)

**Arrival**: How an Animal came to be on the Farm — born here at a Calving, bought in at an Intake, or already standing when the Farm opened its register. Derived from the Move that put her in her first Pen, never entered. _Avoid_: Entry (an Entry is what a phone sends the Farm), admission, onboarding

**Exit**: How an Animal left and when — Sold, Died or Culled — with what belongs to that way of going: who bought her and where she went, or what she died of and what was done with her. Derived from her State and the records of it, never entered; null while she is still here. Every paper and page says it the same way, because it is worked out once. _Avoid_: Departure, removal, disposal (that is what was done with a carcass)

## Work

**Milking Session**: One of the two daily times the Dairy herd is milked — early morning and afternoon. The milking SOP runs once per Milking Session. _Avoid_: Milking time, shift

**Trigger**: What causes an SOP to fall due: a schedule (a time), an event (something happened), or an animal's state (a condition became true). One SOP may have more than one. _Avoid_: Schedule (that's one kind of Trigger), reminder

## SOPs

**SOP Definition**: The authored procedure: its name, purpose, Triggers, assigned role, checker role, due time and grace, and ordered Steps. What the Owner edits. _Avoid_: Template, workflow

**SOP Version**: An immutable snapshot of an SOP Definition. Every change creates a new one; history shows which Version was followed. _Avoid_: Revision, edit

**SOP Instance**: One occurrence of an SOP falling due — e.g. morning milking on a given day. Assigned to a role, claimable by a person, reviewed by the checker. Most are in a Pen; work about the whole farm, like the Registration's renewal, is in none. _Avoid_: Task (too generic), job, run

**Step**: One ordered item inside an SOP. May repeat per animal in the Instance's group. Requires Evidence; may write a farm record or change an animal's state. _Avoid_: Checkpoint, action

**Step Completion**: The recorded act of doing one Step (once per animal if the Step repeats): who, when, and the Evidence. _Avoid_: Tick, log, entry (the general word — a Step Completion is one kind of **Entry**)

**Evidence**: What a Step requires to count as done: a tick, a number with unit, a choice from a list, a photo, or a note. Required or optional per Step. _Avoid_: Proof, data, field

**Step Shape**: What a Step that feeds a later act has to ask for, and in what order. Most Steps are the Owner's to word as they like; a few are not, because what a Service, a Calving, a Pregnancy Check, a DLS report or a Campaign's Lot Number records is read back by the farm afterwards. A Shape names each answer it asks for — what kind it is, whether the Step must insist on it, may not, or the farm decides, and for a choice the fixed words the record reads back under whatever the farm calls them. Said once: the phone drafts a Step from it, publishing refuses one that does not keep it, and the Effect reads each answer by its name. _Avoid_: Schema, contract, form

**Effect**: What completing a Step writes into the farm's records beyond the Evidence itself — a Milk Record, a Weigh-in, a dose. Runs in the same transaction as the Step Completion and is keyed on it, so a corrected entry replaces what it wrote. When the farm has moved past what the Step says — she has been walked on since, her calves have left — the Effect stands aside and writes nothing: a Step arriving so is a late Entry, kept for a person, and a Correction so is kept and put in front of the Manager as Needs Review. _Avoid_: Side effect, hook, trigger (which is how an SOP falls due)

**Gate**: A rule by which an animal's state blocks a Step or an SOP from completing — e.g. milk withdrawal blocks that cow's milk from bulk; meat withdrawal blocks her sale. A hard block, not a warning. _Avoid_: Validation, warning, lock

**Sign-off**: The checker's review of a completed SOP Instance: approve, or send back with a reason. _Avoid_: Approval (one outcome of Sign-off), verification

**The Day Turning**: Everything the Farm does because time has passed rather than because somebody did something: work falling due, a visiting Vet's days running out, Alerts swept for work gone late and holds ending and feed running low, and the evening's Digest carried. Idempotent, and run both by the server's own timer and by whoever opens the app — so a farm whose server is asleep is a farm that catches up the moment somebody looks at it, and neither run does anything twice. _Avoid_: Schedule (that is one kind of Trigger), cron, job

**Grace**: The minutes after an Instance's due time before it counts as Overdue. Set per SOP. _Avoid_: Buffer, slack, tolerance (which is milk's word)

**Overdue** / **Missed**: An Instance past its due time and Grace is Overdue and the Manager is alerted. It becomes Missed only when the Manager closes it with a reason. Nothing disappears on its own. _Avoid_: Expired, skipped, failed

**Called Off**: An Instance the farm no longer owes, closed by what changed rather than by a person: the animal it was for left the farm, the Heat that raised it was taken back, her calving moved, the report it would deliver was withdrawn. Not Missed and not outstanding — nobody fell short. Named in the trail with what called it off, and raised again if its cause comes back; Missed work never is. _Avoid_: Withdrawn (the Treatment Gate's word), cancelled, Missed (the Manager's close)

## Herd structure

**Side**: Which half of the farm an Animal currently belongs to: Dairy or Fattening. Exactly one at a time; changing Side is a recorded move. _Avoid_: Department, unit, type

**State**: Where an Animal is in its lifecycle. Dairy: Calf, Heifer, Pregnant Heifer, Milking, Dry. Fattening: Quarantine, Fattening, Ready for Sale. Exits: Sold, Died, Culled. Exactly one at a time. _Avoid_: Status, stage, category

**Shed**: A building on the Farm containing Pens. _Avoid_: Barn, house, unit

**Pen**: A physical enclosure inside a Shed. Every Animal is in exactly one Pen; SOP Instances run per Pen or per Shed. _Avoid_: Group (a Pen _is_ the group), lot, batch

**Move**: The recorded event of an Animal changing Pen — including a change of Side. The only way an Animal's location changes. _Avoid_: Transfer, relocation

**Pen Spell**: Where an Animal stood and for how long: from the Move that put her there until the Move that took her away, or until her Exit. Derived from her Moves, never entered — her Pen history is her Pen Spells end to end, and her page, her Animal Passport and what her feed cost all read the same ones. _Avoid_: Stay, placement, pen history line

**Weaning**: The point at which a Calf stops being fed milk; on this Farm the trigger for a male Calf's Move to Fattening. _Avoid_: Separation

## Health

**Observation**: What somebody saw of one Animal on the round — off her feed, lame, bulling — recorded by the Step that saw it, from the words that Version offers. Starts the health chain; not a Diagnosis. An Observation of oestrus is what a Heat is recorded as. Corrections withdraw one and write another beside it; nothing is removed. _Avoid_: Symptom, complaint, report, sighting

**Diagnosis**: The Vet's recorded conclusion about what an Animal has. Vet-only, recorded by the Vet themselves and never on their behalf — it is their act in law. It may answer an Observation, which is how the health chain reads as one story on the Animal's page; it may also stand alone. Corrected only by the Vet who made it, with a reason, and nothing is removed. _Avoid_: Finding, condition, case

**Prescription**: The Vet's order for one Animal: drug, dose, route, frequency, duration. Vet-only, from their own account, and only from a product whose Withdrawal days are known. It answers a Diagnosis. The system turns it into one Instance of the Treatment SOP per dose, at the times the Vet set, so a dose nobody gave is Overdue beside a milking nobody did. _Avoid_: Treatment plan, order, script

**Treatment**: One dose given to an Animal, and the Withdrawal it earns: what was given, who gave it and when. It reaches her two ways — a dose of a Prescription, where the farm knows it owes the dose before anybody gives it (which is what makes a missed one visible as work nobody did), or a dose of a Campaign, where nothing is owed until the Pen is walked. The last Treatment **given** starts the Withdrawal. _Avoid_: Medication, administration, dosing

**Drug List**: The farm's list of products that may be prescribed or given in a Campaign, each with milk and meat withdrawal days. Maintained by the Vet; a product with blank days cannot be prescribed. _Avoid_: Formulary, inventory (stock is a different concern), medicine list

**Withdrawal**: The period after the last Treatment given during which an Animal's milk may not go to bulk (milk withdrawal) or the Animal may not be sold for meat (meat withdrawal). A hard Gate. Only the Vet may shorten it, with a reason. _Avoid_: Withholding period, waiting time, hold

**Campaign**: A vaccination or a deworming run over a Pen as one piece of work with a per-Animal Step, so every Animal ends up with the Treatment in her own history. The Version names the product; the Manager decides the day. _Avoid_: Programme, batch treatment, mass medication

**Vaccine**: A product on the Drug List the Vet has marked as one. Its doses go on the vaccination register, and each must be traceable to a Lot Number. _Avoid_: Jab, shot

**Lot Number**: The manufacturer's number on a vaccine vial, which traces a dose back to what was in it. A Campaign asks for it once for the Pen, and every dose of that Campaign without one of its own came from it; a dose from another vial carries its own. _Avoid_: Batch (a Batch is an Outbox send), batch number, vial number

**Mortality**: The record that an Animal died or was culled: when, the cause as far as the farm knows it, and how the carcass was disposed of. The Owner's or the Manager's to record, and nobody else's — except a stillborn calf's, which her Calving records with the cause stillbirth, leaving the disposal awaiting until the Manager writes it. She leaves the herd — off the pen boards, out of the day's work, out of the headcounts — and everything else recorded about her stays exactly where it is. _Avoid_: Death record, loss, wastage

**Disposal**: What was done with a carcass: buried (the rule is six feet) or burned. Evidence, because an inspector may ask. Never a word for a Sale — an Animal sold is Sold, and "disposal" is what happened to a body. _Avoid_: Removal, destruction

**Notifiable Disease**: A disease on the farm's own list of those that must be reported to DLS in writing without delay (Animal Disease Act 2005, s.3). The list is what the Upazila Livestock Officer confirms to this farm, with the confirmation noted beside each entry, because the national schedule could not be sourced. A Vet Diagnosis naming one raises the DLS report work immediately and tells the Owner and the Manager. _Avoid_: Reportable disease, outbreak

## Milk

**Milk Record**: The litres one cow gave in one Milking Session, with a Destination. Captured as a Step Completion of the milking SOP. _Avoid_: Yield entry, milk log, production record

**Destination**: Where a Milk Record's litres went: Bulk, Calves, or Discard. Withdrawal forces Discard. _Avoid_: Use, allocation

**Bulk**: The saleable milk pooled from a Milking Session. Its recorded total is reconciled against the per-cow Milk Records. _Avoid_: Tank, total milk

**Dispatch**: The recorded hand-over of Bulk milk to a buyer: when, litres, the buyer (a Counterparty, whose name and address make it the farm's milk-buyer record under the Safe Food Act, kept as they stood on the day the milk left), the challan when the collector writes one, the price per litre, and optional fat %, SNF %, note. The Manager's to record. Read beside the litres the day's Milk Records sent to Bulk, so milk into the tank and milk out of the gate are not two stories. _Avoid_: Sale (finance's word for the money side), delivery, supply

**Lactation**: One cow's milking period from a calving to the following Dry-off. Numbered per cow; days-in-milk and totals are derived from Milk Records. _Avoid_: Milking cycle, production period

**Reconciliation**: The comparison of a Milking Session's Bulk total against the sum of its per-cow Milk Records destined for Bulk. A difference beyond the Tolerance is flagged for the Manager. _Avoid_: Balancing, audit, check

**Tolerance**: The Farm Parameter, as a percentage, within which a Reconciliation difference passes unremarked. _Avoid_: Margin, threshold, allowance

**Days in Milk**: How long a cow has been in her current Lactation, counted from the calving that started it. Derived, never entered. _Avoid_: DIM (in prose), lactation age

**Dry-off**: The recorded end of a Lactation before the next calving. Moves the cow from Milking to Dry. _Avoid_: Drying, rest period

## Fattening

**Intake**: The recorded arrival of a bought-in Animal on the Fattening side: source, price, intake weight, estimated age, photo, Target Window. Creates the Animal in Quarantine. _Avoid_: Purchase (finance's word), arrival, admission

**Weigh-in**: A recorded scale reading for one Animal on a date. Fortnightly for Fattening; daily gain and projections are derived from Weigh-ins. Every reading is kept — the difference between two of them is the thing being measured — and one that changed more than an animal could is still kept, flagged with what the farm found, and raised as a **Needs Review** for the Manager. _Avoid_: Weight check, weighing record

**Days on Feed**: How long a bought-in Animal has been on the Farm being fed, counted from its Intake. Derived, never entered — like Days in Milk. _Avoid_: Age on farm, feeding days

**Average Daily Gain**: Kilogrammes an Animal puts on in a day, worked out between two Weigh-ins or between its Intake and its latest Weigh-in. The Farm reads both: the gap between them is how it sees a Ration that has stopped working. Derived, never entered. _Avoid_: ADG on its own (say it in full), growth rate

**Target Window**: The period in which the Farm intends to sell an Animal — by default the next Eid-ul-Adha. Drives projected weight and the Ready-for-Sale suggestion. _Avoid_: Sale date, deadline

**Ready for Sale**: The State an Animal enters when the Manager confirms it may be sold. Suggested by the system when target weight is reached or the Target Window opens; impossible under meat Withdrawal, whichever way it is asked for. _Avoid_: Finished, market-ready, matured

**Suggestion**: The farm saying an Animal may be ready to sell, with the grounds it says so on. Never a decision and never a **Gate**: it moves nothing on its own, and the Manager confirms or sets it aside. _Avoid_: Recommendation, alert (an Alert is told to somebody; a Suggestion waits on a screen)

**Set Aside**: The Manager's recorded answer to a Suggestion — this Animal is staying, and why. Not a **Needs Review**, which is the system asking a person to settle something it could not; this is a person settling something the system only offered. The farm stops suggesting her until a ground appears that was not there when the Manager looked. _Avoid_: Dismiss, snooze, ignore

**Sale**: The recorded hand-over of an Animal to a buyer: buyer, price, weight at sale, destination, transport. Hard-gated by meat Withdrawal; the Animal exits as Sold, and by no other route — every way out of the herd is the record of how she went. A cull that ends at a butcher is a Sale and not a **Mortality**: one exit, one record, and the reason she was culled in the Sale's own note. _Avoid_: Dispatch (milk's word), disposal, exit, offtake

## Reproduction

**Heat**: A recorded observation that a cow is in oestrus: cow, time, signs. Raises the AI SOP, due at the start of the farm's **AI Window** and late at its end. Seen twice before she is served, it is still one heat and raises one job. _Avoid_: Oestrus, standing, bulling

**AI Window**: The hours after a Heat is seen within which a service takes — by default twelve to eighteen. A Farm Parameter, because how soon a technician reaches the farm is this farm's fact and not a fact about cattle. _Avoid_: Service window, breeding window

**Service**: A recorded insemination — AI (semen straw) or natural (bull) — with date, sire, and who did it. Recorded by the Manager alone, as the Step of the AI work its Heat raised, so the service _is_ that work done rather than something closed beside it. A natural service names a bull standing on this farm. The ones that did not take are kept: a run of them is what makes a Repeat Breeder. _Avoid_: Breeding (the whole area), mating, insemination (AI only)

**Attempt**: The services of one heat — one, or two when she is served again a few hours later. The Pregnancy Check is of an Attempt and counts from its first service, and one that did not take is one failure however many times she was served. An Attempt followed by another before anybody found her carrying did not take: she came back into heat. _Avoid_: Cycle, try, breeding

**Pregnancy Check**: The Vet's recorded result, positive or negative, of an Attempt — due a Farm Parameter's days (45 by default) after its first service, once per Attempt, and only for her latest. The Vet's alone. Positive sets the Expected Calving and makes a Heifer a Pregnant Heifer; a negative is kept and takes nothing from her. _Avoid_: PD (fine in speech), scan, confirmation

**Expected Calving**: The first service of the heat a positive Pregnancy Check found her carrying from, plus the gestation length (a Farm Parameter, 283 days by default). Worked out and re-worked whenever what it counts from changes, never typed — except for a cow that arrives already carrying, whose Expected Calving is given at intake or on the opening register because nobody on this farm served her. Drives the Dry-off and Calving-prep SOPs, due a lead of days before it (Farm Parameters, 60 and 7 by default); when it moves, work still open moves with it and work done stays done. It is a forecast of Dairy work, so it goes when she calves, leaves the farm or crosses to Fattening, taking the calving work still owed with it; whether she was carrying stays in her Pregnancy Checks. _Avoid_: Due date, calving date (that's the actual Calving)

**Calving**: The recorded birth event: when, how it went (unassisted, assisted, with the vet), and each calf's sex and whether it was born alive. Recorded by Barn Staff as a Step, or by the Manager. Starts the dam's next Lactation and ends her Expected Calving; every calf becomes an Animal with the next dairy Tag Number in her mother's Pen. Twins are one Calving with two calves, and a stillborn calf is created and leaves as Died in the same act. _Avoid_: Birth, parturition, delivery

**Abortion**: The recorded loss of a pregnancy before Calving: date, stage, Vet note. The Vet's alone. Clears the pregnancy and its Expected Calving, closes the calving work still owed, and puts a Pregnant Heifer back on heat watch. Not a failed Attempt: she took, and lost it. _Avoid_: Miscarriage, loss

**Repeat Breeder**: A flag the system raises on a cow after a threshold of failed Services (default 3), counted by Attempt — two services in one heat that did not take are one failure. Waits on the Manager's queue and buzzes nobody's phone, until somebody answers — serve her again, treat her, or cull her — and comes back if she fails again after the answer. A prompt for a human decision, never an automatic State change. _Avoid_: Infertile, cull candidate

## Feed

**Feed Item**: Something the Farm feeds, tracked in a unit (kg by default). Home-grown fodder is a Feed Item too. _Avoid_: Ingredient, feed type, commodity

**Ration**: A named, versioned list of Feed Items with kg per animal per day. Pens are put on one; several Pens may share it, and changing it is one change. _Avoid_: Diet, feeding plan, formula

**Feeding Target**: What one session of feeding calls for in one Pen — the Ration in force, times the animals standing there, divided by how often they are fed. Worked out, never typed. Not a **Target Window**, which is Fattening's date range. _Avoid_: Quota, allowance, plan

**Feeding**: The recorded act of feeding one Pen in one session: kg of each Feed Item actually given, plus any leftover note. Consumes Stock. Its cost — each Feed Item's price at the time, times what was given — is charged evenly to the Animals standing in the Pen when it was fed; fodder at no price costs nothing. _Avoid_: Feed log, feed entry

**Feed Purchase**: Feed bought and brought into the store: the Feed Item, how much, what the lot cost, and the Counterparty who sold it — the **seller**, as on an Intake. What a Feed Item's price is worked out from. Not the finance side of buying anything else, which is a Money Event. _Avoid_: Order, delivery, procurement, supplier

**Harvest**: Feed cut from the farm's own fields and brought into the store, at no price and from nobody. It adds to Stock on Hand at no cost, so the feed it is mixed with is charged at what the farm really paid for all of it. _Avoid_: Home stock, own production

**Stock on Hand**: Current quantity of a Feed Item: Feed Purchases and Harvests in, minus Feeding, corrected by the latest Stock Count. Worked out, never typed, and shown below nothing when the pens were fed from feed nobody wrote down arriving. _Avoid_: Inventory (the whole area), balance

**Stock Count**: The weekly physical count of each Feed Item — every one the Farm keeps, counted without seeing what the store is thought to hold. The count wins: Stock on Hand reads from it afterwards. Each difference is an adjustment with a reason, read against the store as it now stands, so something written up late but dated before the count shows in it rather than as a loss. _Avoid_: Stocktake, audit

**Running Low**: A Feed Item holding less than the level the Manager set for it. It waits on the Manager's queue and the Owner's exception list, and is told once in the Manager's Digest each time it falls below the level — never as a push. _Avoid_: Shortage, out of stock (that is nothing left), reorder point

## Money

**Money Event**: One recorded flow of money in or out of the Farm: amount in BDT, date, category, Counterparty, payment method, and a link to the farm record that caused it where one exists. A Dispatch, an Intake, a Sale, a Feed Purchase, a Medicine Purchase and a Vet Fee each make one on their own, and a Correction to the record puts the same one right. Everything else — wages, electricity, repairs, manure sold — the Manager enters by hand, with a note, a photo of the receipt, and the Side it belongs to when it belongs to one; a wage names the person and the month it pays for, once per person per month. _Avoid_: Transaction, journal entry, payment (one kind)

**Medicine Purchase**: Medicine bought for a product on the Drug List: how much, as the box or the shop says it; roughly how many doses that holds; what it cost; and who sold it. What a dose given is costed from. _Avoid_: Drug order, pharmacy bill

**Vet Fee**: What the Vet charges the Farm for a visit, entered by the Vet: the amount, the day, and the Animals seen when the Vet names them. The only money the Vet enters or sees. _Avoid_: Consultation charge, visit bill

**Receipt**: The paper a buyer leaves with: every Animal they took on one day, with weights, prices and the total, headed by the farm of origin. One per buyer per day, however many beasts — five sheets is how one of them gets lost. _Avoid_: Invoice (the farm is not billing anybody), bill, challan (that is milk's word, on a Dispatch)

**Transport Card**: The paper the lorry carries: farm of origin with its Registration number, the Animals on that vehicle by tag, the destination, the date and the driver (Meat Rules 2021 r.18). One per **Load**, never one per day. _Avoid_: Movement permit, waybill, pass

**Load**: The Animals that went to one destination, on one vehicle, with one driver, on one day. What a Transport Card describes — a card covering a whole day's sales to one buyer would assert a load that was never on that lorry. _Avoid_: Consignment, shipment, batch

**Counterparty**: A person or business the Farm buys from, sells to, or pays: name, address, phone. Recorded once per name and shared across Sale, Dispatch, Intake, Purchase and Money Events — the trader who sells the Farm a bull is often the man who buys one back at Eid. Called the **seller** on an Intake and the **buyer** on a Sale, which is the side he stands on rather than a second kind of record. _Avoid_: Customer, vendor, contact, party

**Category**: The farm-defined heading a Money Event falls under (milk sales, feed, medicine, wages, utilities…). Used for reports. Every farm starts with the standard ones; the farm adds its own, and retires one rather than removing it. A Category a record books under — milk sales from a Dispatch, say — is not retired, nor entered by hand, which would be the same money twice; the one exception is a vet's fee, which a visiting vet with no login is paid all the same. Wages are not retired either: the one-wage-a-month rule is kept by them. _Avoid_: Account, head, GL code

**Margin**: What a fattening Animal made: her Sale price less her purchase price, the feed charged to her, her doses and her share of the Vet Fees for visits that named her. Worked out, never stored, and only once she is sold. Not a **Tolerance**, which is how far a reading may be off. _Avoid_: Profit, return

**Cost per Litre**: What a litre of milk cost the farm: the feed, doses and Vet Fees charged to a cow over her current Lactation, over the litres she sent to Bulk in it — or, for the Dairy side, everything charged to its animals in a period over the litres sent to Bulk in it. Worked out, never stored. _Avoid_: Production cost, unit cost

**Cost of Gain**: What each kilogram a fattening Animal put on cost: everything charged to her, over the weight she gained between arriving and her latest Weigh-in or her Sale. _Avoid_: Feed conversion (that is kg of feed, not taka)

**Approval Threshold**: The BDT amount above which a Money Event the Owner did not enter waits, unapproved, for the Owner's approval. Only the money waits: the record that made it — the milk gone, the bull bought — is never held back. An approval is of what the Owner read — the amount, who it went to or came from, and its Category — so a Correction that changes any of those asks again. _Avoid_: Limit, sign-off amount

## Access

**Role**: One of Owner, Manager, Staff, Vet. A person may hold several; every recorded action names the Role it was done under. _Avoid_: Permission level, user type, group

**Membership**: What makes somebody one of the Farm's people: the Roles they hold, whether they still work here, the Pens they keep and the PIN they switch in with. It begins with an invitation taken up and ends when the Owner disables them — turned away at sign-in, signed out everywhere, while every record they wrote stays exactly where it is. The Farm is never left without an Owner, and nobody ends their own Membership. Not their **Account**, which is how they sign in at all. _Avoid_: Account (that is the sign-in), user record, permissions (what a Role may do), access

**Account**: How somebody signs in: their email, the password only they know, and wherever they are signed in. The Farm never sets a password for anybody — one somebody else has seen is one that signs work in their name — so somebody who has forgotten theirs is handed a one-time code, read out in person, and chooses their own. Whoever runs the Farm can see where a person is signed in and turn one of those out: a phone left in a yard is the Farm's problem. An Account is not a **Membership**: ending the Membership shuts the Account's door on this Farm, and the Account is what the door is on. _Avoid_: Login, credentials, profile

**Pen Assignment**: The Pens a Staff member is responsible for. Defines what they see and may record as Barn Staff — their **Scope** under that Role. _Avoid_: Area, zone, allocation

**Visiting Scope**: A Vet account limited to animals with an open case they are on, granted per visit and time-limited. It is the **Scope** of their work as the Vet. _Avoid_: Guest access, temporary account

**Scope**: What a person may see and record acting under one Role: the whole farm for the Owner, the Manager and a Vet; their Pen Assignment for Barn Staff; their Visiting Scope for a Vet called in for a visit; and both together for Barn Staff who are also visiting. Barn Staff may still look up any animal by her Tag Number, read-only; a visitor may not. Worked out for each piece of work from the Role it is done under, never from the highest Role they hold. _Avoid_: Permissions (what a Role may do), access level, visibility

## Offline

**Entry**: One thing a person recorded that the farm takes the same way however it arrives — at once, or held in an Outbox and sent in a Batch: a claim, a Step Completion, a Step photo, a finish, a Move, an Observation. Recorded under the Role it was done in and dated when it was done, with when the farm received it kept beside; when the world has moved since — the animal has left, someone else took the work — it is kept for a person rather than refused. _Avoid_: Write, mutation, record (a record is what an Entry leaves in the farm's books)

**Batch**: One send from an Outbox: the entries a phone has been holding, with one key for the lot, applied with their Audit Events in a single transaction. Frozen when it is formed — the entries are written down exactly as they will be sent, proof of who recorded them included — so every attempt under its key carries the same thing, whatever the phone learns in between. _Avoid_: Sync, upload, push

**Waiting for a PIN**: A frozen Batch cannot be formed while a tab on the phone still holds a PIN entered offline: the work is that person's, and until the farm has seen the PIN there is nothing to prove it with. The Batch waits and is offered again — waiting is not a failed attempt, and no work is ever handed back for it. A PIN the farm refused, or one no tab holds any more, is not waited for: the entry goes unproved, and the farm keeps it for a person like any Entry it cannot take. _Avoid_: Blocked, stalled, retrying

**Idempotency Key**: The client's own name for a Batch. The same key arriving again is answered from what was stored, never applied twice; the same key carrying different entries is refused. _Avoid_: Request id, transaction id, nonce

**Sequence Number**: The position an entry has in its own phone's Outbox. Gaps in it are entries the farm has never read — worth saying out loud, never a reason to refuse what did arrive. _Avoid_: Index, offset, counter

**Outbox**: The durable on-device queue of entries made without signal, sent in order when signal returns. Never emptied without the server's acknowledgement. _Avoid_: Cache, buffer, pending list (that's what the user _sees_)

**Needs Review**: Something the system accepted but could not settle on its own, waiting for a person: an entry the server took although the world had changed since it was recorded, or a Correction whose effects it cannot walk back. Raised by the system, resolved by the Manager with their judgement recorded; never discarded. _Avoid_: Conflict (a Correction made against a record changed since is refused, not kept), rejected, error

## Audit

**Restore Drill**: The quarterly rehearsal of losing the farm's database: a backup restored into a scratch environment and checked by the Manager in the app. Recorded whether or not it went well. _Avoid_: Test, DR test, failover

**Audit Event**: The append-only record of one state change: who (and in which Role), from which device, when by both clocks, what changed. Written in the same transaction as the change. _Avoid_: Log entry, history row, activity

**Correction**: Putting a wrong fact right, with a reason: the record takes its right value, and an Audit Event written in the same transaction keeps what it said before and supersedes the event that wrote it, so the original stays visible in the trail. An Observation is the exception — withdrawn and a new one written beside it, because the health chain shows both. The only way a fact ever changes. _Avoid_: Edit, update, amendment, delete

**Correction Window**: How long after an entry a given Role may still correct it: Staff 2 hours on their own entries, Manager 30 days on any, Owner always, Vet always on their own health entries. Measured by the farm's clock from when the entry reached it. A fact that was never an entry — Expected Calving, a person's name — has no window, only the Roles that may correct it. _Avoid_: Grace period (that's for SOP due times), edit window

## Compliance

**Farm Identity**: What the Farm is, as every document leaving it prints: name, address, phone and Registration number. Written down once by the Owner or the Manager; not a Farm Parameter, which is a number to tune. _Avoid_: Farm details, farm profile, company information

**Registration**: The Farm's DLS registration: number, office, issue and expiry dates, certificate photo. Renewed annually by 31 March; the renewal SOP is raised for the Owner the renewal lead (90 days) before, falls due on the day it runs out, and its closing Step records the new expiry and the renewed certificate. _Avoid_: Licence, permit

**Inspector View**: The single screen the Manager shows a DLS inspector: Registration, herd summary (the animals on the farm by Side and State and by Pen), vaccination register, 30-day treatment register, 6-month disease history, mortality — each printed as a paper and handed over, with the movement log (every Move, Intake, Sale and death in a period) as a CSV; the inspector never touches the phone. _Avoid_: Audit page, compliance dashboard

**Register**: One of the records the Farm keeps for an inspector over a period: the vaccination register (a year), the treatment register (thirty days), the disease history (six months), the mortality register (a year) and the movement log (a year). Each says once how far back it looks unless asked, how it is read, what it is called and what its columns hold — and from that comes the paper an inspector is handed, the CSV they take away, the rows the Inspector View lists and the Export that records each. What a person reads off one on the screen is the screen's own to decide. A Register is not the herd summary or the Registration record, which are what the Farm is today rather than a period of it. _Avoid_: Report (a Report is what a screen shows), log (only the movement log is one), compliance record

**Animal Passport**: The per-animal paper: identity, Pen history, treatments with their withdrawals, weigh-ins, and how she left if she has. Given to a buyer or slaughter vet on request — including after she has gone, which is when they ask. _Avoid_: Animal record (that's the live data), certificate

**Withdrawal Summary**: The one-page answer to the question a buyer actually asks: what an Animal has had in the last thirty days, and whether her meat is clear today. Read from the same Withdrawal record the Sale is gated on, so the paper and the gate cannot disagree. _Avoid_: Health certificate (the farm certifies nothing), clearance

**Export**: Any report or document the system generates for someone outside it. Always an Audit Event; always stamped with farm, Registration number, time and user. _Avoid_: Download, print-out, report (a Report is what it shows; an Export is the act)

## Notifications

**DLS Report**: The letter to the Upazila Livestock Officer about one notifiable Diagnosis, and the record of it going: when it was delivered and the reference the office filed it under. A report that was sent and cannot be evidenced is a report that was not sent. _Avoid_: Notification (the general word), filing, submission

**Notice**: One thing the Farm tells a person — that work is late, that a hold ends tomorrow, that money is waiting for the Owner. It carries the facts its words need, snapshotted as they were when it was raised, and it sits in that person's list whether or not it ever reached their phone. Every Notice is one of three kinds: an **Alert**, which goes now; one the **Digest** carries; or a **Needs Review**, which is not finished until a person has decided. Each kind says what facts it carries and who on the Farm hears it. _Avoid_: Notification (the general word — this is it, named), message, event

**Alert**: An immediate notification for something that costs money or breaks a legal deadline if missed: overdue work, withdrawal ending, a notifiable diagnosis, an entry the farm would not take. Ignores quiet hours. What makes one an Alert is that it goes _now_ — the farm's in-app list holds these and the quieter notices side by side, and a notice that waits for the Digest is not an Alert however it is stored. Two of them also go by SMS, to the Owner and the Manager: a Withdrawal ending and a notifiable Diagnosis, because those two cost money or break a deadline and a push that does not arrive has cost nobody anything. The farm's delivery table is the one place that decides any of this. _Avoid_: Notification (the general word), warning, reminder

**Digest**: The batched notification carrying everything that is not an Alert, at the times the farm sets (06:00 and 18:00 by default). It names what is in it. Everything it carries is in the app whether or not it is delivered. _Avoid_: Summary, newsletter, report

**Quiet Hours**: The span the farm is asleep (22:00–05:00 by default), when nothing that can wait reaches a phone. A Digest due inside them waits for the farm to wake; an Alert goes anyway. The in-app list is never quietened — quiet hours quieten the phone, not the farm's own record of what is waiting. _Avoid_: Do not disturb, night mode, silence

**Push**: An Alert delivered to an installed app on a device that agreed to be told, so it arrives with the app closed. The in-app Alert is the record; Push is the tap on the shoulder, and may fail without anything being lost. _Avoid_: Notification (the general word), alert (the thing being delivered), message

**Escalation**: The single extra rung: an overdue instance still open after the escalation window (default 2 hours) also notifies the Owner. _Avoid_: Chain, tiering

## Devices & onboarding

**Shed Phone**: A farm-provided Android phone kept in a Shed, holding a device session. Staff record on it after a PIN Switch. _Avoid_: Barn tablet, kiosk, terminal

**PIN Switch**: A Staff member making themselves the active user on a Shed Phone with their 4-digit PIN. Works offline; every entry is attributed to the active user, never to the phone. _Avoid_: Login (that's the device session), shared account

**Switch Token**: What the farm gives a person for one stint on a Shed Phone when it has seen their PIN, and what an Entry recorded during that stint carries to prove whose work it is. Kept only until the Entry is sent; never written into a record anybody can read, because a proof anybody can read is a proof anybody can use. _Avoid_: Session token (that's the device's), password, key

**Coach Overlay**: The one-time in-app hint shown the first time a person meets a screen type. Dismissable; re-openable from help. _Avoid_: Tutorial, tour, onboarding flow

**SOP Card**: The one-page Bangla print/in-app sheet generated from a published SOP Version: name, steps, icons, evidence. The training material. _Avoid_: Manual, guide, cheat-sheet

**Trained On**: The record that one person was taught one SOP Version, on a day, by somebody. Append-only: a new Version does not untrain anybody and training on it does not erase what they were taught before, because "who knew which procedure" is a question about a date that has already passed. _Avoid_: Certified, signed off (that is the Manager checking work), competent
