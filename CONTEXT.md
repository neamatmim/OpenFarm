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

**Observation**: A Staff or Manager note that an Animal looks unwell (sick, lame, off-feed). Starts the health chain; not a Diagnosis. _Avoid_: Symptom, complaint, report

**Diagnosis**: The Vet's recorded conclusion about what an Animal has. Vet-only. _Avoid_: Finding, condition

**Prescription**: The Vet's order for one Animal: drug, dose, route, frequency, duration. Vet-only; the system turns it into one Treatment instance per dose. _Avoid_: Treatment plan, order, script

**Treatment**: One dose actually given to an Animal under a Prescription — who, when, what. The last Treatment starts the Withdrawal. _Avoid_: Medication, administration, dosing

**Drug List**: The farm's list of products that may be prescribed, each with milk and meat withdrawal days. Maintained by the Vet; a product with blank days cannot be prescribed. _Avoid_: Formulary, inventory (stock is a different concern), medicine list

**Withdrawal**: The period after the last Treatment during which an Animal's milk may not go to bulk (milk withdrawal) or the Animal may not be sold for meat (meat withdrawal). A hard Gate. Only the Vet may shorten it, with a reason. _Avoid_: Withholding period, waiting time, hold

**Notifiable Disease**: A disease on the farm's list of conditions that must be reported to DLS in writing without delay. A Diagnosis of one auto-raises the DLS report SOP. _Avoid_: Reportable disease, outbreak

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

**Weigh-in**: A recorded scale reading for one Animal on a date. Fortnightly for Fattening; daily gain and projections are derived from Weigh-ins. _Avoid_: Weight check, weighing record

**Target Window**: The period in which the Farm intends to sell an Animal — by default the next Eid-ul-Adha. Drives projected weight and the Ready-for-Sale suggestion. _Avoid_: Sale date, deadline

**Ready for Sale**: The State an Animal enters when the Manager confirms it may be sold. Suggested by the system when target weight is reached or the Target Window opens; impossible under meat Withdrawal. _Avoid_: Finished, market-ready, matured

**Sale**: The recorded hand-over of an Animal to a buyer: buyer, price, weight at sale, destination, transport. Hard-gated by meat Withdrawal; the Animal exits as Sold. _Avoid_: Dispatch (milk's word), disposal, exit

## Reproduction

**Heat**: A recorded observation that a cow is in oestrus: cow, time, signs. Raises the AI SOP. _Avoid_: Oestrus, standing, bulling

**Service**: A recorded insemination — AI (semen straw) or natural (bull) — with date, sire, and who did it. _Avoid_: Breeding (the whole area), mating, insemination (AI only)

**Pregnancy Check**: The Vet's recorded result ~45 days after a Service: positive or negative. Positive sets the Expected Calving. _Avoid_: PD (fine in speech), scan, confirmation

**Expected Calving**: Service date + gestation length (283 days by default). Drives the Dry-off and Calving-prep SOPs. _Avoid_: Due date, calving date (that's the actual Calving)

**Calving**: The recorded birth event: date, ease, calf sex, live/stillborn. Starts the dam's next Lactation and creates the Calf. _Avoid_: Birth, parturition, delivery

**Abortion**: The recorded loss of a pregnancy before Calving: date, stage, Vet note. Clears the pregnancy. _Avoid_: Miscarriage, loss

**Repeat Breeder**: A flag the system raises on a cow after a threshold of failed Services (default 3). A prompt for a human decision, never an automatic State change. _Avoid_: Infertile, cull candidate

## Feed

**Feed Item**: Something the Farm feeds, tracked in a unit (kg by default). Home-grown fodder is a Feed Item too. _Avoid_: Ingredient, feed type, commodity

**Ration**: A named, versioned list of Feed Items with kg per animal per day, assigned to a Pen. _Avoid_: Diet, feeding plan, formula

**Feeding**: The recorded act of feeding one Pen in one session: kg of each Feed Item actually given, plus any leftover note. Consumes Stock. _Avoid_: Feed log, feed entry

**Stock on Hand**: Current quantity of a Feed Item: purchases and harvests in, minus Feeding, corrected by the latest Stock Count. _Avoid_: Inventory (the whole area), balance

**Stock Count**: The weekly physical count of each Feed Item. Differences are booked as adjustments with a reason. _Avoid_: Stocktake, audit

## Money

**Money Event**: One recorded flow of money in or out of the Farm: amount in BDT, date, category, Counterparty, payment method, and a link to the farm record that caused it where one exists. _Avoid_: Transaction, journal entry, payment (one kind)

**Counterparty**: A person or business the Farm buys from, sells to, or pays: name, address, phone. Shared across Sale, Dispatch, Intake, Purchase and Money Events. _Avoid_: Customer, vendor, contact, party

**Category**: The farm-defined heading a Money Event falls under (milk sales, feed, medicine, wages, utilities…). Used for reports. _Avoid_: Account, head, GL code

**Approval Threshold**: The BDT amount above which a Money Event entered by the Manager needs the Owner's approval. _Avoid_: Limit, sign-off amount

## Access

**Role**: One of Owner, Manager, Staff, Vet. A person may hold several; every recorded action names the Role it was done under. _Avoid_: Permission level, user type, group

**Pen Assignment**: The Pens a Staff member is responsible for. Defines what they see and may record. _Avoid_: Area, zone, allocation

**Visiting Scope**: A Vet account limited to animals with an open case they are on, granted per visit and time-limited. _Avoid_: Guest access, temporary account

## Offline

**Outbox**: The durable on-device queue of entries made without signal, sent in order when signal returns. Never emptied without the server's acknowledgement. _Avoid_: Cache, buffer, pending list (that's what the user _sees_)

**Needs Review**: Something the system accepted but could not settle on its own, waiting for a person: an entry the server took although the world had changed since it was recorded, or a Correction whose effects it cannot walk back. Raised by the system, resolved by the Manager with their judgement recorded; never discarded. _Avoid_: Conflict (reserved for a failed correction), rejected, error

**Conflict Record**: A stored, unapplied correction whose expected version did not match. Waits for a human; never overwrites. _Avoid_: Merge, clash

## Audit

**Audit Event**: The append-only record of one state change: who (and in which Role), from which device, when by both clocks, what changed. Written in the same transaction as the change. _Avoid_: Log entry, history row, activity

**Correction**: A new record that supersedes a wrong one, pointing at it and carrying a reason. The original stays visible. The only way a fact ever changes. _Avoid_: Edit, update, amendment, delete

**Correction Window**: How long after an entry a given Role may still correct it: Staff 2 hours on their own entries, Manager 30 days on any, Owner always, Vet always on their own health entries. _Avoid_: Grace period (that's for SOP due times), edit window

## Compliance

**Registration**: The Farm's DLS registration: number, office, issue and expiry dates, certificate photo. Renewed annually by 31 March; the renewal SOP is raised 90 days before. _Avoid_: Licence, permit

**Inspector View**: The single screen the Manager shows a DLS inspector: Registration, herd count, vaccination register, 30-day treatment register, 6-month disease history, mortality — each exportable to PDF. _Avoid_: Audit page, compliance dashboard

**Animal Passport**: The per-animal PDF: identity, photo, Pen history, treatments and withdrawal status, vaccinations, weigh-ins. Given to a buyer or slaughter vet on request. _Avoid_: Animal record (that's the live data), certificate

**Export**: Any report or document the system generates for someone outside it. Always an Audit Event; always stamped with farm, Registration number, time and user. _Avoid_: Download, print-out, report (a Report is what it shows; an Export is the act)

## Notifications

**Alert**: An immediate notification for something that costs money or breaks a legal deadline if missed: overdue work, withdrawal ending, a notifiable diagnosis, sync problems. Ignores quiet hours; the two safety Alerts also go by SMS. _Avoid_: Notification (the general word), warning, reminder

**Digest**: The batched notification sent at 06:00 and 18:00 carrying everything that is not an Alert. _Avoid_: Summary, newsletter, report

**Escalation**: The single extra rung: an overdue instance still open after the escalation window (default 2 hours) also notifies the Owner. _Avoid_: Chain, tiering

## Devices & onboarding

**Shed Phone**: A farm-provided Android phone kept in a Shed, holding a device session. Staff record on it after a PIN Switch. _Avoid_: Barn tablet, kiosk, terminal

**PIN Switch**: A Staff member making themselves the active user on a Shed Phone with their 4-digit PIN. Works offline; every entry is attributed to the active user, never to the phone. _Avoid_: Login (that's the device session), shared account

**Coach Overlay**: The one-time in-app hint shown the first time a person meets a screen type. Dismissable; re-openable from help. _Avoid_: Tutorial, tour, onboarding flow

**SOP Card**: The one-page Bangla print/in-app sheet generated from a published SOP Version: name, steps, icons, evidence. The training material. _Avoid_: Manual, guide, cheat-sheet
