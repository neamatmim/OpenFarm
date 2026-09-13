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

**Owner**: The person who owns the Farm, sets the Playbook, and can see and approve everything. _Avoid_: Admin, boss

**Farm Manager**: The person who runs the Farm day to day: assigns SOP work, signs it off, and keeps the records honest. _Avoid_: Supervisor, admin

**Barn Staff**: The people who do SOP work at the animal — milkers, feeders, herdsmen. They record on phones, often without signal. _Avoid_: Worker, labourer, operator

**Vet**: A veterinarian or para-vet, in-house or visiting, who diagnoses, prescribes, and records treatments. _Avoid_: Doctor, animal health worker

## Animals

**Animal**: One individual head of cattle the Farm is responsible for, from arrival or birth until sale or death. Belongs to Dairy or Fattening at any given time. _Avoid_: Cow (a cow is a female that has calved — a specific kind of Animal), head, stock

**Tag Number**: An Animal's permanent identity: a side-of-origin prefix and a running number (`D-0001`, `F-0001`), assigned at birth or intake, never reused, unchanged if the Animal changes Side. _Avoid_: ID, animal number, ear-tag number

**Ear Tag**: The physical tag carrying the Tag Number. Can be lost and replaced; a replacement carries the same Tag Number and the Re-tag is recorded. _Avoid_: Tag (ambiguous with Tag Number)

**Official Tag**: Any government or pilot-scheme tag an Animal also carries. Recorded as an attribute; never the identity. _Avoid_: Government ID, national ID

**Re-tag**: The recorded event of replacing a lost or unreadable Ear Tag with one carrying the same Tag Number. _Avoid_: Re-numbering (which never happens)

## Work

**Milking Session**: One of the two daily times the Dairy herd is milked — early morning and afternoon. The milking SOP runs once per Milking Session. _Avoid_: Milking time, shift

**Trigger**: What causes an SOP to fall due: a schedule (a time), an event (something happened), or an animal's state (a condition became true). One SOP may have more than one. _Avoid_: Schedule (that's one kind of Trigger), reminder

## SOPs

**SOP Definition**: The authored procedure: its name, purpose, Triggers, assigned role, checker role, due time and grace, and ordered Steps. What the Owner edits. _Avoid_: Template, workflow

**SOP Version**: An immutable snapshot of an SOP Definition. Every change creates a new one; history shows which Version was followed. _Avoid_: Revision, edit

**SOP Instance**: One occurrence of an SOP falling due — e.g. morning milking on a given day. Assigned to a role, claimable by a person, reviewed by the checker. _Avoid_: Task (too generic), job, run

**Step**: One ordered item inside an SOP. May repeat per animal in the Instance's group. Requires Evidence; may write a farm record or change an animal's state. _Avoid_: Checkpoint, action

**Step Completion**: The recorded act of doing one Step (once per animal if the Step repeats): who, when, and the Evidence. _Avoid_: Tick, entry, log

**Evidence**: What a Step requires to count as done: a tick, a number with unit, a choice from a list, a photo, or a note. Required or optional per Step. _Avoid_: Proof, data, field

**Effect**: What completing a Step writes into the farm's records beyond the Evidence itself — a Milk Record, a Weigh-in, a dose. Runs in the same transaction as the Step Completion and is keyed on it, so a replayed or corrected entry replaces what it wrote. _Avoid_: Side effect, hook, trigger (which is how an SOP falls due)

**Gate**: A rule by which an animal's state blocks a Step or an SOP from completing — e.g. milk withdrawal blocks that cow's milk from bulk; meat withdrawal blocks her sale. A hard block, not a warning. _Avoid_: Validation, warning, lock

**Sign-off**: The checker's review of a completed SOP Instance: approve, or send back with a reason. _Avoid_: Approval (one outcome of Sign-off), verification

**Grace**: The minutes after an Instance's due time before it counts as Overdue. Set per SOP. _Avoid_: Buffer, slack, tolerance (which is milk's word)

**Overdue** / **Missed**: An Instance past its due time and Grace is Overdue and the Manager is alerted. It becomes Missed only when the Manager closes it with a reason. Nothing disappears on its own. _Avoid_: Expired, skipped, failed

## Herd structure

**Side**: Which half of the farm an Animal currently belongs to: Dairy or Fattening. Exactly one at a time; changing Side is a recorded move. _Avoid_: Department, unit, type

**State**: Where an Animal is in its lifecycle. Dairy: Calf, Heifer, Pregnant Heifer, Milking, Dry. Fattening: Quarantine, Fattening, Ready for Sale. Exits: Sold, Died, Culled. Exactly one at a time. _Avoid_: Status, stage, category

**Shed**: A building on the Farm containing Pens. _Avoid_: Barn, house, unit

**Pen**: A physical enclosure inside a Shed. Every Animal is in exactly one Pen; SOP Instances run per Pen or per Shed. _Avoid_: Group (a Pen _is_ the group), lot, batch

**Move**: The recorded event of an Animal changing Pen — including a change of Side. The only way an Animal's location changes. _Avoid_: Transfer, relocation

**Weaning**: The point at which a Calf stops being fed milk; on this Farm the trigger for a male Calf's Move to Fattening. _Avoid_: Separation

## Health

**Observation**: What somebody saw of one Animal on the round — off her feed, lame, bulling — recorded by the Step that saw it, from the words that Version offers. Starts the health chain; not a Diagnosis. An Observation of oestrus is what a Heat is recorded as. Corrections withdraw one and write another beside it; nothing is removed. _Avoid_: Symptom, complaint, report, sighting

**Diagnosis**: The Vet's recorded conclusion about what an Animal has. Vet-only, recorded by the Vet themselves and never on their behalf — it is their act in law. It may answer an Observation, which is how the health chain reads as one story on the Animal's page; it may also stand alone. Corrected only by the Vet who made it, with a reason, and nothing is removed. _Avoid_: Finding, condition, case

**Prescription**: The Vet's order for one Animal: drug, dose, route, frequency, duration. Vet-only, from their own account, and only from a product whose Withdrawal days are known. It answers a Diagnosis. The system turns it into one Instance of the Treatment SOP per dose, at the times the Vet set, so a dose nobody gave is Overdue beside a milking nobody did. _Avoid_: Treatment plan, order, script

**Treatment**: One dose given to an Animal, and the Withdrawal it earns: what was given, who gave it and when. It reaches her two ways — a dose of a Prescription, where the farm knows it owes the dose before anybody gives it (which is what makes a missed one visible as work nobody did), or a dose of a Campaign, where nothing is owed until the Pen is walked. The last Treatment **given** starts the Withdrawal. _Avoid_: Medication, administration, dosing

**Drug List**: The farm's list of products that may be prescribed or given in a Campaign, each with milk and meat withdrawal days. Maintained by the Vet; a product with blank days cannot be prescribed. _Avoid_: Formulary, inventory (stock is a different concern), medicine list

**Withdrawal**: The period after the last Treatment given during which an Animal's milk may not go to bulk (milk withdrawal) or the Animal may not be sold for meat (meat withdrawal). A hard Gate. Only the Vet may shorten it, with a reason. _Avoid_: Withholding period, waiting time, hold

**Campaign**: A vaccination or a deworming run over a Pen as one piece of work with a per-Animal Step, so every Animal ends up with the Treatment in her own history. The Version names the product; the Manager decides the day. _Avoid_: Programme, batch treatment, mass medication

**Mortality**: The record that an Animal died or was culled: when, the cause as far as the farm knows it, and how the carcass was disposed of. The Owner's or the Manager's to record, and nobody else's. She leaves the herd — off the pen boards, out of the day's work, out of the headcounts — and everything else recorded about her stays exactly where it is. _Avoid_: Death record, loss, wastage

**Disposal**: What was done with a carcass: buried (the rule is six feet) or burned. Evidence, because an inspector may ask. Never a word for a Sale — an Animal sold is Sold, and "disposal" is what happened to a body. _Avoid_: Removal, destruction

**Notifiable Disease**: A disease on the farm's own list of those that must be reported to DLS in writing without delay (Animal Disease Act 2005, s.3). The list is what the Upazila Livestock Officer confirms to this farm, with the confirmation noted beside each entry, because the national schedule could not be sourced. A Vet Diagnosis naming one raises the DLS report work immediately and tells the Owner and the Manager. _Avoid_: Reportable disease, outbreak

## Milk

**Milk Record**: The litres one cow gave in one Milking Session, with a Destination. Captured as a Step Completion of the milking SOP. _Avoid_: Yield entry, milk log, production record

**Destination**: Where a Milk Record's litres went: Bulk, Calves, or Discard. Withdrawal forces Discard. _Avoid_: Use, allocation

**Bulk**: The saleable milk pooled from a Milking Session. Its recorded total is reconciled against the per-cow Milk Records. _Avoid_: Tank, total milk

**Dispatch**: The recorded hand-over of Bulk milk to a buyer: litres, buyer, challan/receipt, and optional fat %, SNF %, note. _Avoid_: Sale (finance's word for the money side), delivery, supply

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

**Service**: A recorded insemination — AI (semen straw) or natural (bull) — with date, sire, and who did it. Recorded by the Manager alone, as the Step of the AI work its Heat raised, so the service *is* that work done rather than something closed beside it. A natural service names a bull standing on this farm. The ones that did not take are kept: a run of them is what makes a Repeat Breeder. _Avoid_: Breeding (the whole area), mating, insemination (AI only)

**Attempt**: The services of one heat — one, or two when she is served again a few hours later. The Pregnancy Check is of an Attempt and counts from its first service, and one that did not take is one failure however many times she was served. An Attempt followed by another before anybody found her carrying did not take: she came back into heat. _Avoid_: Cycle, try, breeding

**Pregnancy Check**: The Vet's recorded result, positive or negative, of an Attempt — due a Farm Parameter's days (45 by default) after its first service, once per Attempt, and only for her latest. The Vet's alone. Positive sets the Expected Calving and makes a Heifer a Pregnant Heifer; a negative is kept and takes nothing from her. _Avoid_: PD (fine in speech), scan, confirmation

**Expected Calving**: The first service of the heat a positive Pregnancy Check found her carrying from, plus the gestation length (a Farm Parameter, 283 days by default). Worked out and re-worked whenever what it counts from changes, never typed — except for a cow that arrives already carrying, whose Expected Calving is given at intake or on the opening register because nobody on this farm served her. Drives the Dry-off and Calving-prep SOPs, due a lead of days before it (Farm Parameters, 60 and 7 by default); when it moves, work still open moves with it and work done stays done. _Avoid_: Due date, calving date (that's the actual Calving)

**Calving**: The recorded birth event: when, how it went (unassisted, assisted, with the vet), and each calf's sex and whether it was born alive. Recorded by Barn Staff as a Step, or by the Manager. Starts the dam's next Lactation and ends her Expected Calving; every calf becomes an Animal with the next dairy Tag Number in her mother's Pen. Twins are one Calving with two calves, and a stillborn calf is created and leaves as Died in the same act. _Avoid_: Birth, parturition, delivery

**Abortion**: The recorded loss of a pregnancy before Calving: date, stage, Vet note. The Vet's alone. Clears the pregnancy and its Expected Calving, closes the calving work still owed, and puts a Pregnant Heifer back on heat watch. Not a failed Attempt: she took, and lost it. _Avoid_: Miscarriage, loss

**Repeat Breeder**: A flag the system raises on a cow after a threshold of failed Services (default 3), counted by Attempt — two services in one heat that did not take are one failure. Waits on the Manager's queue and buzzes nobody's phone, until somebody answers — serve her again, treat her, or cull her — and comes back if she fails again after the answer. A prompt for a human decision, never an automatic State change. _Avoid_: Infertile, cull candidate

## Feed

**Feed Item**: Something the Farm feeds, tracked in a unit (kg by default). Home-grown fodder is a Feed Item too. _Avoid_: Ingredient, feed type, commodity

**Ration**: A named, versioned list of Feed Items with kg per animal per day. Pens are put on one; several Pens may share it, and changing it is one change. _Avoid_: Diet, feeding plan, formula

**Feeding Target**: What one session of feeding calls for in one Pen — the Ration in force, times the animals standing there, divided by how often they are fed. Worked out, never typed. Not a **Target Window**, which is Fattening's date range. _Avoid_: Quota, allowance, plan

**Feeding**: The recorded act of feeding one Pen in one session: kg of each Feed Item actually given, plus any leftover note. Consumes Stock. _Avoid_: Feed log, feed entry

**Purchase**: Feed bought and brought into the store: the Feed Item, how much, what the lot cost, and the Counterparty it came from. What a Feed Item's weighted-average price is worked out from. _Avoid_: Order, delivery, procurement

**Harvest**: Feed cut from the farm's own fields and brought into the store, at no price and from nobody. It adds to Stock on Hand and leaves the price alone. _Avoid_: Home stock, own production

**Stock on Hand**: Current quantity of a Feed Item: Purchases and Harvests in, minus Feeding, corrected by the latest Stock Count. Worked out, never typed, and shown below nothing when the pens were fed from feed nobody wrote down arriving. _Avoid_: Inventory (the whole area), balance

**Stock Count**: The weekly physical count of each Feed Item. Differences are booked as adjustments with a reason. _Avoid_: Stocktake, audit

## Money

**Money Event**: One recorded flow of money in or out of the Farm: amount in BDT, date, category, Counterparty, payment method, and a link to the farm record that caused it where one exists. _Avoid_: Transaction, journal entry, payment (one kind)

**Receipt**: The paper a buyer leaves with: every Animal they took on one day, with weights, prices and the total, headed by the farm of origin. One per buyer per day, however many beasts — five sheets is how one of them gets lost. _Avoid_: Invoice (the farm is not billing anybody), bill, challan (that is milk's word, on a Dispatch)

**Transport Card**: The paper the lorry carries: farm of origin with its Registration number, the Animals on that vehicle by tag, the destination, the date and the driver (Meat Rules 2021 r.18). One per **Load**, never one per day. _Avoid_: Movement permit, waybill, pass

**Load**: The Animals that went to one destination, on one vehicle, with one driver, on one day. What a Transport Card describes — a card covering a whole day's sales to one buyer would assert a load that was never on that lorry. _Avoid_: Consignment, shipment, batch

**Counterparty**: A person or business the Farm buys from, sells to, or pays: name, address, phone. Recorded once per name and shared across Sale, Dispatch, Intake, Purchase and Money Events — the trader who sells the Farm a bull is often the man who buys one back at Eid. Called the **seller** on an Intake and the **buyer** on a Sale, which is the side he stands on rather than a second kind of record. _Avoid_: Customer, vendor, contact, party

**Category**: The farm-defined heading a Money Event falls under (milk sales, feed, medicine, wages, utilities…). Used for reports. _Avoid_: Account, head, GL code

**Approval Threshold**: The BDT amount above which a Money Event entered by the Manager needs the Owner's approval. _Avoid_: Limit, sign-off amount

## Access

**Role**: One of Owner, Manager, Staff, Vet. A person may hold several; every recorded action names the Role it was done under. _Avoid_: Permission level, user type, group

**Pen Assignment**: The Pens a Staff member is responsible for. Defines what they see and may record. _Avoid_: Area, zone, allocation

**Visiting Scope**: A Vet account limited to animals with an open case they are on, granted per visit and time-limited. _Avoid_: Guest access, temporary account

## Offline

**Batch**: One send from an Outbox: the entries a phone has been holding, with one key for the lot, applied with their Audit Events in a single transaction. _Avoid_: Sync, upload, push

**Idempotency Key**: The client's own name for a Batch. The same key arriving again is answered from what was stored, never applied twice; the same key carrying different entries is refused. _Avoid_: Request id, transaction id, nonce

**Sequence Number**: The position an entry has in its own phone's Outbox. Gaps in it are entries the farm has never read — worth saying out loud, never a reason to refuse what did arrive. _Avoid_: Index, offset, counter

**Outbox**: The durable on-device queue of entries made without signal, sent in order when signal returns. Never emptied without the server's acknowledgement. _Avoid_: Cache, buffer, pending list (that's what the user _sees_)

**Needs Review**: Something the system accepted but could not settle on its own, waiting for a person: an entry the server took although the world had changed since it was recorded, or a Correction whose effects it cannot walk back. Raised by the system, resolved by the Manager with their judgement recorded; never discarded. _Avoid_: Conflict (reserved for a failed correction), rejected, error

**Conflict Record**: A stored, unapplied correction whose expected version did not match. Waits for a human; never overwrites. _Avoid_: Merge, clash

## Audit

**Restore Drill**: The quarterly rehearsal of losing the farm's database: a backup restored into a scratch environment and checked by the Manager in the app. Recorded whether or not it went well. _Avoid_: Test, DR test, failover

**Audit Event**: The append-only record of one state change: who (and in which Role), from which device, when by both clocks, what changed. Written in the same transaction as the change. _Avoid_: Log entry, history row, activity

**Correction**: A new record that supersedes a wrong one, pointing at it and carrying a reason. The original stays visible. The only way a fact ever changes. _Avoid_: Edit, update, amendment, delete

**Correction Window**: How long after an entry a given Role may still correct it: Staff 2 hours on their own entries, Manager 30 days on any, Owner always, Vet always on their own health entries. _Avoid_: Grace period (that's for SOP due times), edit window

## Compliance

**Farm Identity**: What the Farm is, as every document leaving it prints: name, address, phone and Registration number. Written down once by the Owner or the Manager; not a Farm Parameter, which is a number to tune. _Avoid_: Farm details, farm profile, company information

**Registration**: The Farm's DLS registration: number, office, issue and expiry dates, certificate photo. Renewed annually by 31 March; the renewal SOP is raised 90 days before. _Avoid_: Licence, permit

**Inspector View**: The single screen the Manager shows a DLS inspector: Registration, herd count, vaccination register, 30-day treatment register, 6-month disease history, mortality — each exportable to PDF. _Avoid_: Audit page, compliance dashboard

**Animal Passport**: The per-animal paper: identity, Pen history, treatments with their withdrawals, weigh-ins, and how she left if she has. Given to a buyer or slaughter vet on request — including after she has gone, which is when they ask. _Avoid_: Animal record (that's the live data), certificate

**Withdrawal Summary**: The one-page answer to the question a buyer actually asks: what an Animal has had in the last thirty days, and whether her meat is clear today. Read from the same Withdrawal record the Sale is gated on, so the paper and the gate cannot disagree. _Avoid_: Health certificate (the farm certifies nothing), clearance

**Export**: Any report or document the system generates for someone outside it. Always an Audit Event; always stamped with farm, Registration number, time and user. _Avoid_: Download, print-out, report (a Report is what it shows; an Export is the act)

## Notifications

**DLS Report**: The letter to the Upazila Livestock Officer about one notifiable Diagnosis, and the record of it going: when it was delivered and the reference the office filed it under. A report that was sent and cannot be evidenced is a report that was not sent. _Avoid_: Notification (the general word), filing, submission

**Alert**: An immediate notification for something that costs money or breaks a legal deadline if missed: overdue work, withdrawal ending, a notifiable diagnosis, an entry the farm would not take. Ignores quiet hours. What makes one an Alert is that it goes _now_ — the farm's in-app list holds these and the quieter notices side by side, and a notice that waits for the Digest is not an Alert however it is stored. Two of them also go by SMS, to the Owner and the Manager: a Withdrawal ending and a notifiable Diagnosis, because those two cost money or break a deadline and a push that does not arrive has cost nobody anything. The farm's delivery table is the one place that decides any of this. _Avoid_: Notification (the general word), warning, reminder

**Digest**: The batched notification carrying everything that is not an Alert, at the times the farm sets (06:00 and 18:00 by default). It names what is in it. Everything it carries is in the app whether or not it is delivered. _Avoid_: Summary, newsletter, report

**Quiet Hours**: The span the farm is asleep (22:00–05:00 by default), when nothing that can wait reaches a phone. A Digest due inside them waits for the farm to wake; an Alert goes anyway. The in-app list is never quietened — quiet hours quieten the phone, not the farm's own record of what is waiting. _Avoid_: Do not disturb, night mode, silence

**Push**: An Alert delivered to an installed app on a device that agreed to be told, so it arrives with the app closed. The in-app Alert is the record; Push is the tap on the shoulder, and may fail without anything being lost. _Avoid_: Notification (the general word), alert (the thing being delivered), message

**Escalation**: The single extra rung: an overdue instance still open after the escalation window (default 2 hours) also notifies the Owner. _Avoid_: Chain, tiering

## Devices & onboarding

**Shed Phone**: A farm-provided Android phone kept in a Shed, holding a device session. Staff record on it after a PIN Switch. _Avoid_: Barn tablet, kiosk, terminal

**PIN Switch**: A Staff member making themselves the active user on a Shed Phone with their 4-digit PIN. Works offline; every entry is attributed to the active user, never to the phone. _Avoid_: Login (that's the device session), shared account

**Coach Overlay**: The one-time in-app hint shown the first time a person meets a screen type. Dismissable; re-openable from help. _Avoid_: Tutorial, tour, onboarding flow

**SOP Card**: The one-page Bangla print/in-app sheet generated from a published SOP Version: name, steps, icons, evidence. The training material. _Avoid_: Manual, guide, cheat-sheet

**Trained On**: The record that one person was taught one SOP Version, on a day, by somebody. Append-only: a new Version does not untrain anybody and training on it does not erase what they were taught before, because "who knew which procedure" is a question about a date that has already passed. _Avoid_: Certified, signed off (that is the Manager checking work), competent
