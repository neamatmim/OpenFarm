# OpenFarm Release 1 — spec

Status: ready-for-agent

Source: the completed wayfinder map [`map.md`](./map.md) (25 decisions, 2026-09-10), its tickets in [`issues/`](./issues/), the assets in [`assets/`](./assets/), the glossary [`CONTEXT.md`](../../CONTEXT.md), and ADRs 0001–0003 in `docs/adr/`. Where this spec and a ticket's Answer disagree, the ticket wins and this spec has a bug. Vocabulary is the glossary's; capitalised terms are defined there.

---

## Problem Statement

We run a 100–500 head cattle farm in Bangladesh with a Dairy side and a Fattening side. Nothing about it is recorded systematically: milk yields, treatments, weights, breeding and money live in the Owner's and Manager's heads and on scraps of paper. The procedures that make the farm work — the Playbook of 26 SOPs — are not written down at all, so they are followed unevenly, missed silently, and cannot be proven to a DLS inspector, a milk processor, or a buyer at Eid. Two failures are expensive: a treated cow's milk reaching the bulk tank, and a treated animal being sold inside its withdrawal period. Barn Staff work on phones that lose signal inside the sheds and many read Bangla more comfortably than English. We want a system that holds the farm's records **and** enforces the farm's procedures, is trustworthy enough to declare to DLS as our record-keeping method, and can later become a product for other farms without a rewrite.

## Solution

OpenFarm is an SOP-driven operations system for one Farm. The Owner authors the Playbook as versioned SOP Definitions; the system turns them into scheduled, event-driven and state-driven SOP Instances assigned to roles; Barn Staff complete Steps on Shed Phones — in Bangla, with icons and animal photos, offline — recording Evidence that _is_ the farm's record (litres, kilograms, doses, ticks, photos). Steps write farm records and change animal State, and an Animal's State hard-gates other SOPs: milk withdrawal forces a cow's milk to Discard; meat withdrawal refuses her Sale. The Manager signs off, chases overdue work and resolves needs-review entries; the Owner sees an exception list and KPI tiles, approves money above a threshold, and publishes SOP changes. Every state change is an append-only Audit Event with the person, the Role used, the device and both clocks; nothing is ever deleted — facts change only by Correction. Fifteen generated documents — an Inspector View, an Animal Passport, sale receipts and transport cards, milk dispatch records, a DLS disease letter, an accountant export — are the whole external surface; nobody outside the four Roles logs in. Release 1 ships in seven increments, the first being the herd register and the milking SOP end-to-end.

## User Stories

### Identity, roles and devices

1. As an Owner, I want to create users and assign them one or more Roles, so that each person can do exactly their job.
2. As an Owner, I want every action to record which Role it was done under, so that a Manager who also milks is accountable in the right capacity.
3. As a Manager, I want to invite Barn Staff and grant a visiting Vet time-limited access subject to Owner approval, so that onboarding doesn't wait on the Owner.
4. As a Manager, I want to enrol a Shed Phone with a device session and set each Staff member's 4-digit PIN, so that shared phones still attribute every entry to a person.
5. As Barn Staff, I want to PIN Switch to myself on the Shed Phone even without signal, so that I can record in the barn as me.
6. As Barn Staff, I want the Shed Phone to auto-lock after inactivity, so that the next person can't record as me.
7. As a Vet, I want a personal login that works from anywhere, so that a phone consult still ends with my prescription entered by me.
8. As a visiting Vet, I want to see only the animals with an open case I'm on plus herd health summaries, so that I get what I need and nothing else.
9. As Barn Staff, I want to see all animals and open Instances in my assigned Pens, look up any animal by Tag Number read-only, and never see money or other people's completions, so that my screen is about my work.
10. As an Owner, I want the app in Bangla by default for Staff with English available per user, so that everyone reads what they're comfortable with.

### Herd

11. As a Manager, I want to register an Animal with only Tag Number, sex, Side, Pen and source, adding breed, age and photo later, so that registration never blocks on missing facts.
12. As a Manager, I want the system to assign Tag Numbers as `D-0001…` for Dairy-born and `F-0001…` for Fattening intake, never reused, so that identity is unambiguous for life.
13. As a Manager, I want to record an Official Tag as an attribute, so that a government tag never replaces our identity.
14. As a Manager, I want a lost Ear Tag replaced with the same Tag Number as a recorded Re-tag, so that history never splits.
15. As a Manager, I want each Animal to have a profile photo shown wherever an animal is picked, so that Staff record against the right cow.
16. As a Manager, I want Sheds containing Pens, every Animal in exactly one Pen, and every Pen change recorded as a Move, so that location history is complete.
17. As a Manager, I want to move an Animal between Sides as a recorded Move, so that a dairy cow can be fattened without losing her lactation history.
18. As an Owner, I want each Animal to have exactly one State from the lifecycle (Calf, Heifer, Pregnant Heifer, Milking, Dry; Quarantine, Fattening, Ready for Sale; exits Sold, Died, Culled), so that SOPs apply to the right animals.
19. As a Manager, I want male calves flagged for a Move to Fattening at Weaning, so that the rule is applied without remembering it.
20. As a Manager, I want an exited Animal to keep its full history forever, so that an inspector can ask about any animal we ever had.
21. As a Manager, I want to import the opening register from a CSV with old marks kept as aliases, so that go-live doesn't retype the herd.

### Playbook and SOP engine

22. As an Owner, I want to author an SOP Definition in Bangla with a purpose, Triggers, an assigned role, a checker role, due time, grace window and ordered Steps, so that my Playbook is enforced, not remembered.
23. As an Owner, I want every change to an SOP to be a new immutable Version, with in-flight Instances finishing on the Version they started on, so that I can prove what procedure was in force on any date (ADR 0001).
24. As a Manager, I want to propose a change to an SOP for the Owner to approve, so that fixes from the barn reach the Playbook.
25. As an Owner, I want Bangla content required to publish and English optional, so that nothing reaches Staff untranslated.
26. As an Owner, I want Triggers of three kinds — schedule, event, and animal-state — including event-relative schedules ("N days after service"), so that all 26 SOPs can be expressed.
27. As Barn Staff, I want SOP Instances for my Pens to appear when due, assigned to my role, so that I can claim one and start.
28. As a Manager, I want to pin an Instance to a person or reassign it, so that absences don't need re-authoring.
29. As Barn Staff, I want a Step that repeats per animal to show the Pen's animals as photo tiles I can complete in any order, with completed tiles dimmed and withdrawn animals ringed and locked, so that the parlour's real order works.
30. As Barn Staff, I want to enter numeric Evidence on a full-screen sheet with a large Bangla keypad, unit label, skip and confirm, so that entry is fat-finger-proof.
31. As Barn Staff, I want to skip an animal with a reason, so that a sick or absent cow is recorded as such, never left blank.
32. As Barn Staff, I want Steps to require tick, number with unit and sane range, choice, photo or note Evidence, so that I record exactly what the procedure needs.
33. As Barn Staff, I want a number outside its sane range to warn me before I confirm, so that typos are caught at the animal.
34. As Barn Staff, I want an icon on every Step and Evidence type, so that I can work by picture when reading is slow.
35. As a Manager, I want to review a completed Instance's Evidence and approve it or send it back with a reason, so that quality is checked, not assumed.
36. As Barn Staff, I want a sent-back Instance to come back to me with the reason, so that I can fix or redo it.
37. As a Manager, I want an Instance past due plus grace to become Overdue and alert me, and to stay open until done or closed by me as Missed with a reason, so that nothing disappears silently.
38. As an Owner, I want an Overdue Instance still open after the escalation window to notify me too, so that a missed milking never waits for morning.
39. As an Owner, I want Steps to write farm records (litres → Milk Record; weight → Weigh-in; calving → new Calf) so that the record is a by-product of the work.
40. As an Owner, I want an Animal's State to hard-gate Steps and SOPs (milk Withdrawal → that cow's milking Step blocked to Discard; meat Withdrawal → Sale refuses to complete), so that the two expensive mistakes cannot happen.
41. As Barn Staff, I want non-animal Steps (prep, clean) as chips above the tiles and the bulk-total Step to appear only when everything else is done, so that the flow matches the parlour.
42. As a Manager, I want a one-page Bangla SOP Card generated from each published Version, so that training material is always current.
43. As a Manager, I want to mark "trained on SOP X" for a Staff member as an Audit Event, so that I can show who knew which procedure.

### Milk

44. As Barn Staff, I want to record litres per cow per Milking Session (twice daily) inside the milking SOP, so that per-cow lactation curves exist.
45. As Barn Staff, I want each Milk Record to carry a Destination — Bulk by default, Calves, or Discard forced under Withdrawal — so that treated milk never reaches the tank on my say-so.
46. As a Manager, I want the session's Bulk total reconciled against the sum of per-cow Bulk entries and flagged beyond a tolerance, so that typos and leakage show up the same day.
47. As a Manager, I want to record a Dispatch (litres, buyer, challan, optional fat %, SNF %, note), so that the milk buyer record required by the Safe Food Act exists.
48. As an Owner, I want Lactations to start at Calving, end at Dry-off and be numbered per cow, with days-in-milk and totals derived, so that nobody types what the system knows.

### Health, medicine and withdrawal

49. As Barn Staff, I want to record an Observation (sick, lame, off-feed) on an animal, so that the health chain starts at the barn.
50. As a Vet, I want to record a Diagnosis and a Prescription (drug, dose, route, frequency, duration) that only I can create, so that the legal chain of prescribing is mine.
51. As a Manager, I want a Prescription to create one Treatment SOP Instance per dose on schedule, so that missed doses are visible as Overdue.
52. As a Vet, I want to maintain the Drug List with milk and meat withdrawal days per product, and for a product with blank days to be unprescribable, so that no treatment starts without a known Withdrawal.
53. As a Manager, I want to add a newly bought product to the Drug List with withdrawal days blank for the Vet to fill, so that buying isn't blocked on the Vet.
54. As an Owner, I want Withdrawal to start from the last dose actually given, so that the gate reflects reality.
55. As a Vet, I want to be the only one who can shorten or end a Withdrawal, with a reason, audited, so that the gate has one accountable exception.
56. As a Manager, I want a vaccination or deworming campaign as one Instance per Pen with a per-animal Step, so that every animal's history shows the event.
57. As a Manager, I want to record a Death or Cull with cause and disposal method, so that mortality is complete and the burial rule is evidenced.
58. As a Manager, I want a Vet Diagnosis on the farm's Notifiable Disease list to auto-raise the DLS report SOP due immediately, so that "without delay" is a five-minute step.
59. As a Manager, I want that SOP to generate the pre-filled Bangla letter to the ULO and record its delivery date and reference, so that the report is both sent and evidenced.

### Fattening and sale

60. As a Manager, I want Intake to record source, purchase price, intake weight, estimated age, optional breed, photo and a Target Window defaulting to the next Eid-ul-Adha, so that projection to market exists from day one.
61. As Barn Staff, I want the fortnightly weigh-in to be a scale reading typed per animal, so that gain is tracked without a scale feed.
62. As an Owner, I want average daily gain, days on feed and projected weight at the Target Window derived from Weigh-ins, so that I know where each animal stands.
63. As a Manager, I want the system to suggest Ready for Sale (target weight or window open) and to confirm it myself, never under meat Withdrawal, so that readiness is a judgement informed by a rule.
64. As a Manager, I want a Sale to record buyer, price, weight at sale, destination and transport, be gated by meat Withdrawal, exit the animal as Sold, and produce the transport-card data and a receipt, so that the Meat Rules are satisfied at the moment of sale.
65. As a Manager, I want the buyer and transport prefilled for the next Sale on the same day and a combined receipt, so that Eid day isn't twenty forms.

### Breeding

66. As Barn Staff, I want to record a Heat on the heat-watch SOP and have an AI SOP raised due within the AI window, so that timing is enforced.
67. As a Manager, I want a Service to record AI or natural, the sire and the technician, so that parentage is known.
68. As a Vet, I want a Pregnancy Check SOP auto-due after service whose positive result sets Expected Calving, so that dry-off and calving prep are scheduled by the system.
69. As a Manager, I want the Dry-off and calving-prep SOPs due at their lead times before Expected Calving, so that nobody counts days.
70. As Barn Staff, I want Calving to record ease, calf sex and live/stillborn, move the dam to Milking, start her next Lactation and create the calf with the next `D-` number and a pending tag — including a stillborn calf that immediately exits as Died — so that calving history is complete.
71. As a Manager, I want Abortion to clear the pregnancy and a Repeat Breeder flag after the threshold of failed Services, so that cull-or-treat decisions are prompted, never automatic.

### Feed and stock

72. As a Manager, I want a versioned Ration per Pen as Feed Items with kg per animal per day, so that the feeding target per session is computed from headcount.
73. As Barn Staff, I want the feeding SOP prefilled with the target kg per Feed Item and to record what was actually given plus any leftover, so that a normal day is two taps and a sick pen shows up as refusals.
74. As a Manager, I want Purchases and harvest-in to raise Stock on Hand, Feedings to lower it, and a weekly Stock Count to reconcile with reasoned adjustments, so that stock is real.
75. As a Manager, I want a low-stock threshold per Feed Item to alert me, so that we never run out of concentrate.
76. As an Owner, I want feed cost allocated by weighted-average price × kg fed, split across a Pen's animals by animal-days, so that cost of gain and cost per litre exist.

### Money

77. As a Manager, I want milk sales, cattle purchases, cattle sales, feed and medicine purchases and vet fees to become Money Events automatically from their records, so that finance is mostly free.
78. As a Manager, I want to enter wages and other income/expense with a Category, Counterparty, payment method and receipt photo, so that the month is complete.
79. As an Owner, I want to approve Money Events above the Approval Threshold, so that large spending is mine to authorise.
80. As an Owner, I want a monthly CSV and PDF export for the accountant, so that the books are kept outside the system.
81. As an Owner, I want margin per fattening animal and dairy cost per litre derived, so that I know which side of the farm makes money.

### Offline and sync

82. As Barn Staff, I want to claim and complete Instances, record all Evidence including photos, Moves and Observations with no signal, so that barn work never waits (ADR 0002).
83. As Barn Staff, I want my assigned Pens' animals, States, Withdrawal status and photos available offline from the last sync with a visible sync age, so that I pick the right cow and see the gate.
84. As Barn Staff, I want a pending-entries count pinned on every screen, so that I know what hasn't reached the farm yet.
85. As an Owner, I want entries that arrive after the world changed (animal sold, dose already recorded, weight out of range) accepted and flagged Needs Review for the Manager, never dropped, so that barn evidence survives.
86. As Barn Staff, I want an entry the server rejects (unknown animal, unauthorised) to stay on my phone with its data for re-entry, so that nothing I typed is lost.
87. As a Manager, I want SOP authoring, finance, reports and user admin to be online-only, so that the offline surface stays small and safe.

### Audit and corrections

88. As an Owner, I want every state change to be an append-only Audit Event with actor, Role used, device, both clocks and before/after, written in the same transaction, so that the trail cannot lag the fact.
89. As a Manager, I want to correct an entry within my Correction Window with a reason, keeping the original visible, so that mistakes are fixed without hiding them.
90. As an Owner, I want a Correction to re-run the corrected record's effects and to flag irreversible ones for the Manager, so that a corrected dose recomputes the Withdrawal and a corrected sale never silently un-sells.
91. As an Owner, I want all data kept indefinitely and never purged in Release 1, so that any animal's whole life is answerable.

### Notifications

92. As a Manager, I want Alerts for Overdue work, Withdrawal ending tomorrow, notifiable Diagnoses and sync problems immediately — the two safety ones also by SMS — and everything else in morning and evening Digests with quiet hours, so that my phone is quiet unless it matters.
93. As Barn Staff, I want to be told when a new SOP Version is published and see what changed the first time I open it, so that I don't follow the old procedure.

### Home screens and reports

94. As an Owner, I want my home to open with an exception list (Overdue, approvals, proposals, Withdrawal ending, Needs Review, low stock, renewal due) and KPI tiles below, so that an empty list means the farm is fine.
95. As a Manager, I want my home to show my queue (Overdue, sign-off, Needs Review, Withdrawal, stock) and tiles with per-Pen progress, so that I run the day from one screen.
96. As a Manager, I want an Inspector View — Registration, herd summary, vaccination register, 30-day treatment register, 6-month disease history, mortality — each exportable to PDF, so that an inspection is a rehearsed five minutes.
97. As a Manager, I want to hold the DLS Registration record with a certificate photo and have the renewal SOP raised 90 days before expiry, so that we never lapse.
98. As a Manager, I want an Animal Passport and a buyer Treatment & Withdrawal Summary (no prices, no diagnosis text) per animal, so that buyers and slaughter vets get what they need.
99. As an Owner, I want every Export to be an Audit Event stamped with farm, Registration number, time and user, so that documents are traceable.
100.  As an Owner, I want reports in Bangla with English field labels alongside, A4, in DLS column order, so that inspectors and processors read the same PDF.

## Implementation Decisions

### Shape of the system

- A single-tenant system with a `Farm` root every record belongs to, so that multi-farm can be added later without a rewrite; no tenancy features are built.
- The existing stack is kept unchanged: TanStack Start (React 19) app, oRPC v2 as the only write path, Drizzle ORM on PostgreSQL 18, Better Auth, deployed via Nitro to a managed host in the Singapore region with point-in-time recovery (ADR 0002; Backups & DR).
- Packages: the API package holds the oRPC router, procedures, middleware and effects; the db package holds the schema and Drizzle relations; the auth package holds Better Auth with two principals; the web app holds routes and the offline outbox. A new shared package holds the domain rules that both server and client need (State machine, gate rules, Tag Number format, Bangla numeral formatting, parameter defaults).

### Roles and principals

- Four Roles — Owner, Manager, Staff, Vet — with the permission matrix in [`assets/roles-matrix.md`](./assets/roles-matrix.md). A person may hold several Roles; every write records the Role used. Ten named special actions are modelled as distinct permissions: claim, pin/reassign, approve/send back, close as missed, propose, publish, confirm Ready for Sale, shorten Withdrawal, approve above threshold, grant Visiting Scope.
- Two principals (ADR 0003): a personal session (Better Auth, own phone) and a device session (a Shed Phone enrolled by the Manager) plus an active user established by PIN Switch. PIN hashes sync to the device so PIN Switch works offline; auto-lock after a farm-parameter interval. `recorded_by` is always the active user; the server rejects an entry whose `recorded_by` is not enrolled on that device. Vet Diagnoses and Prescriptions are accepted only from a personal Vet session.
- Staff visibility is scoped by Pen Assignment; Vet accounts carry a scope of full or visiting.

### Herd model

- `Animal`: Tag Number (prefix by Side of origin, sequence per prefix, never reused, unchanged on Side change), Official Tag, sex, breed?, birth date / estimated age?, source (born | bought), profile photo, current Pen, Side, State, aliases (old marks). `Shed` ⊃ `Pen`; an Animal is always in exactly one Pen. `Move` is the only way location or Side changes.
- State machine (from the lifecycle decision; transitions are caused by SOP effects or a recorded Move):

  ```
  Dairy:      Calf → Heifer → Pregnant Heifer → Milking ⇄ Dry
  Fattening:  Quarantine → Fattening → Ready for Sale
  Exits (from any state): Sold | Died | Culled
  Side change: any Dairy state → Fattening (Move); bought-in pregnant heifer enters as Pregnant Heifer
  Male Calf → Fattening at Weaning (farm parameter, default ~3 months)
  ```

  Pregnancy in a cow that has already calved is a fact on `Milking`/`Dry`, not a State.

### SOP engine

- `SopDefinition` → immutable `SopVersion` (ADR 0001) → `SopInstance` (states: due → in progress → completed → approved | sent back → redo; overdue → missed) → `StepCompletion` (one per Step, or per animal for a repeating Step). Version content is `{ bn: required, en?: optional }` for names, step text, choices and skip reasons; publish validation checks Bangla completeness.
- Triggers: schedule (fixed times), event (a record was created), animal-state (a condition became true), and event-relative schedule ("N days before/after event X"). One SOP may have several. Instances are created per Pen or per Shed for group SOPs, per animal for animal-scoped SOPs.
- Steps are linear; a Step may be marked _repeat per animal in the Instance's group_. Evidence types: tick, number with unit and sane range, choice, photo, note; each required or optional. A per-animal Step allows _skip with reason_.
- Step Completion for a per-animal Step is one of (shape taken from the barn-staff prototype, which the Owner confirmed):

  ```ts
  type CowEntry =
    | { kind: "pending" }
    | {
        kind: "done";
        litres: number;
        destination: "bulk" | "calves" | "discard";
      }
    | { kind: "skipped"; reason: string };
  ```

  generalised to `{ done, evidence, destination? } | { skipped, reason }` per Evidence type.

- Effects: a Step declares zero or more effects that run in the same transaction as the completion — write a Milk Record, write a Weigh-in, record a dose (starts/extends Withdrawal), record a Move, complete a Calving (dam → Milking, new Lactation, create Calf), record a Death. Effects are idempotent on the completion's id.
- Gates: a rule evaluated at Step render and at Step completion against the animal's State and Withdrawal: milk Withdrawal ⇒ milking Step for that animal is a hard block to Discard; meat Withdrawal ⇒ Sale SOP cannot complete and Ready for Sale cannot be confirmed. Gates are evaluated client-side from last-synced state and re-evaluated server-side; a client that was stale produces a Needs Review entry, never a silent override.
- Sign-off: checker role approves or sends back with a reason; unreviewed Instances form a queue. Overdue = past due + grace; Missed only by Manager closure with a reason; escalation to Owner after a farm-parameter window.
- Authoring: Owner publishes; Manager proposes; approval publishes a new Version. SOP Cards are generated per Version.

### Milk

- `MilkRecord`: animal, Milking Session (date + session index), litres, Destination (bulk | calves | discard), source Step Completion. `Session` bulk total recorded by the last Step; reconciliation difference flagged beyond a farm-parameter tolerance (default 5%). `Dispatch`: date, litres, Counterparty, challan, fat?, snf?, note. `Lactation` derived from Calving and Dry-off events with a per-cow number.

### Health

- Events per animal: Observation, Diagnosis (Vet), Prescription (Vet), Treatment (a dose), Vaccination, Deworming, Vet visit note, Death/Cull. `DrugList` entries carry milk and meat withdrawal days; blank ⇒ unprescribable. A Prescription creates one Treatment SOP Instance per dose. `Withdrawal` is computed from the last dose given plus the product's days; only a Vet may shorten it, with a reason, audited. A farm-maintained `NotifiableDisease` list; a Diagnosis on it creates the DLS report SOP Instance due immediately, whose Step generates the Bangla letter and records delivery.
- Herd-level campaigns are one Instance per Pen with a per-animal Step so every animal gets its own event.

### Fattening

- `Intake` (source, price, weight, est. age, breed?, photo, Target Window default next Eid-ul-Adha, target weight from a parameter by class) creates the Animal in Quarantine with an `F-` Tag Number. `WeighIn`: kg, method (scale), date. Derived: ADG, days on feed, projected weight at Target Window. Ready for Sale is suggested by rule and confirmed by the Manager; blocked under meat Withdrawal. `Sale`: Counterparty, price, weight, date, destination, transport; exits the animal as Sold; produces transport-card data and a receipt; same-day same-buyer sales prefill and share a combined receipt. One Sale per animal.

### Breeding

- Events: Heat → (AI SOP due within 12–18 h) → Service (AI | natural, sire, technician) → Pregnancy Check (Vet SOP due +45 d) → Expected Calving (service + 283 d) → Dry-off SOP (−60 d) → calving-prep SOP (−7 d) → Calving (ease, calf sex, live/stillborn; effects as above; stillborn calf created then Died). Abortion clears pregnancy. Repeat Breeder flag after N failed Services (default 3). All numbers are farm parameters.

### Feed

- `FeedItem` (unit), versioned `Ration` per Pen (kg per animal per day per item), `Feeding` per Pen per session (kg actually given per item, prefilled; leftover note), `Purchase` / harvest-in, `StockCount` weekly with reasoned adjustments, Stock on Hand derived, low-stock threshold per item. Cost allocation: weighted-average price × kg fed, split by animal-days.

### Money

- `MoneyEvent`: amount (BDT), date, direction, Category, Counterparty, payment method (cash | bKash | bank), receipt photo?, linked record?. Most are created by effects of Dispatch, Intake, Sale, Purchase, Drug List purchase and Vet visit; wages and other are free entries. Owner approval above the Approval Threshold (default BDT 20,000). `Counterparty` is shared by Sale, Dispatch, Intake, Purchase and Money Events. Derived: fattening margin per animal, dairy cost per litre. Monthly CSV + PDF export. Not a ledger.

### Offline capture and sync (ADR 0002)

- Client: TanStack DB collections with the offline-transactions outbox — durable before optimistic apply, FIFO, backoff with jitter, leader election, one idempotency key per transaction, non-retriable errors surfaced. Installed PWA; `navigator.storage.persist()`; photos downscaled and queued as separate idempotent uploads keyed by record id + slot; Workbox background sync replays the same idempotent requests as belt-and-braces.
- Server: a batch oRPC procedure accepts entries + one idempotency key and applies them with their Audit Events in one Drizzle transaction. Client-generated UUIDv7 ids with `INSERT … ON CONFLICT DO NOTHING`; an idempotency-key table replays stored responses; keys retained for weeks. Every entry carries `(device_id, seq)`, `recorded_at` (device) and `received_at` (server); gaps and skew are flagged, not rejected. On 401 the outbox pauses and prompts login.
- Late entries: accepted with `review_status = needs_review` and a reason when the world changed; rejected only for malformed, unauthorised or unknown-animal entries, which stay on the device. Corrections carry `expected_version`; on mismatch a Conflict Record is stored, never an overwrite.
- Offline scope: capture everything; read assigned Pens' animals, State, Withdrawal and photos from last sync with a sync-age banner. Online-only: SOP authoring, finance, reports, Vet prescribing, user admin, Owner/Manager home (with a cached last-known copy).

### Audit and corrections

- `AuditEvent` (append-only): entity, entity id, action, actor, role used, device id, device seq, idempotency key, recorded_at, received_at, before/after payload — written in the same transaction as every state change, including SOP publish, parameter change, user/role change, login and every Export. Facts change only by `Correction` rows that supersede with a reason; no delete exists. Correction Windows are parameters (Staff 2 h own, Manager 30 d any, Owner always, Vet own health always). Corrections re-run effects; irreversible effects are flagged Needs Review; Sale corrections require the Owner. Retention indefinite.

### Notifications

- Channels: in-app + web push for everything; SMS (local gateway, BDT) only for Withdrawal-ending and notifiable-Diagnosis Alerts to Manager and Owner. The 16-row event→recipient table is in the [Notification channels](./issues/23-notification-channels.md) answer. Alerts immediate; Digests at 06:00 and 18:00; quiet hours 22:00–05:00 except Alerts; Escalation to Owner after 2 h. Message language follows the recipient's setting. The home-screen exception list and notifications are fed by the same attention model.

### i18n and formats

- UI strings: English source, Manager-reviewed Bangla translation, build fails on any missing Bangla string. Per-user language, Bangla default for Staff. SOP content authored in Bangla, English optional per Version. Numbers stored as digits, displayed as Bangla numerals in the Bangla UI; Gregorian dates with Bangla month names; metric units, maund shown alongside kg on feed purchases only. Icons on every Step and Evidence type; profile photos wherever an animal is picked; large touch targets. No voice in Release 1.

### Home screens

- Owner home: exception list (Overdue with Escalation, approvals, proposals, Withdrawal ending, Needs Review, low stock, renewal due) above KPI tiles (milk vs 7-day with session bars, tasks ring, Withdrawal count, discard litres, Ready for Sale with Eid projection, ADG and cost of gain, month money, breeding, feed). Manager home: queue (Overdue, sign-off, Needs Review, Withdrawal, stock) above tiles minus money plus per-Pen progress. Only tile-level trends in Release 1.

### Reports and documents

- The 15-item set in [`assets/report-set.md`](./assets/report-set.md) is the whole external surface; no external logins. Bangla with English labels, A4, DLS column order; every Export is an Audit Event stamped with farm, Registration number, timestamp and user. The Inspector View is a single Manager screen over R1–R6.

### Farm parameters

- A single `FarmParameter` set, Manager-editable, with defaults: Milking Sessions (2), reconciliation tolerance 5%, AI window 12–18 h, PD at 45 d, gestation 283 d, dry-off lead 60 d, calving-prep lead 7 d, repeat-breeder threshold 3, weaning ~3 months, weigh-in every 14 d, target weights by class, escalation window 2 h, Correction Windows, Approval Threshold BDT 20,000, Digest times, quiet hours, auto-lock 5 min, registration renewal lead 90 d.

### Sequencing

- Seven increments in the confirmed order in [`assets/release-1-increments.md`](./assets/release-1-increments.md); increment 1 = foundation + herd + the milking SOP end-to-end + audit + offline + Bangla. Go-live prerequisites and their owners are listed there and are not part of the build.

## Testing Decisions

- A good test drives the system through a seam a user of that seam would use and asserts only what is observable from outside — a response, a row, an Audit Event, a gate refusing — never how a module got there. Tests read like the user stories above.
- **Primary seam — the oRPC router, in-process.** Tests call procedures through `createRouterClient` with a context that impersonates a Role (and, for Shed Phones, a device session plus active user), against a real scratch PostgreSQL started from the repo's docker-compose, one database per test run, migrated with drizzle-kit. Nearly every rule in this spec is asserted here: permissions per the matrix, Tag Number assignment, State transitions, SOP Instance creation from each Trigger kind, per-animal Step completion and skip, effects (Milk Record, Withdrawal start, Calving creating a Calf), gates (milk Withdrawal ⇒ Discard; meat Withdrawal ⇒ Sale refused), sign-off and send-back, Overdue/Missed/Escalation timing (with a controllable clock), idempotent replay of the batch procedure, `(device_id, seq)` gap flagging, two-clock storage, Needs Review acceptance versus rejection, Corrections re-running effects and irreversible-effect flagging, Audit Events written in the same transaction (assert by forcing a failure mid-transaction and checking neither row exists), Bangla-required publish validation, report generation contents, Export Audit Events.
- **Secondary seam — the offline outbox executor** against a fake transport: FIFO order, durable-before-apply, retry with backoff, one idempotency key per transaction reused on replay, pause on 401 without loss, non-retriable rejections kept on device, photos queued separately, Needs Review surfaced to the UI state.
- **UI**: one smoke test per screen type with Testing Library and jsdom (route renders in Bangla with the expected tiles/list), plus a Bangla-completeness check as a build step. Screen shapes are settled by the prototypes on branches `prototype/sop-flow` and `prototype/dashboard`; no further UI behaviour tests in Release 1.
- Prior art: none in the repo yet. The first test file establishes the harness (scratch database lifecycle, role contexts, clock control); vitest is available through vite-plus, jsdom and Testing Library are already dev dependencies.
- Not tested: Better Auth internals, TanStack DB internals, PDF rendering pixels (assert content, not layout), SMS delivery (assert the gateway call).

## Out of Scope

- Hardware and sensor feeds — milking parlour, scales, RFID readers — Release 2; Release 1 is manual entry.
- Multi-farm product features — tenancy, onboarding, billing — the data model must not preclude them; none are built.
- External logins and share links — auditor login, per-sale buyer link, accountant portal — documents and exports cover every external need.
- Trend charts — per-lactation milk curves, per-animal ADG charts, monthly trend views; tile-level trends and CSV exports only.
- Batch sale as one object covering several animals; Release 1 prefills the buyer and prints a combined receipt.
- Bangla voice readout of Step text; a practice mode with fake animals; training videos; a shed-wall cheat-sheet.
- Double-entry ledger, VAT, multi-currency; the accountant keeps the books from the export.
- Per-cow milk quality; girth-tape weight estimation; a Bengali-calendar display; purge or archival policy.
- Calf-rearing detail beyond lifecycle states and the newborn-care SOP — belongs in SOP steps, authored by the Owner.

## Further Notes

- **Migration**: none. Nothing systematic exists today; the opening register is compiled during the tagging task and imported once.
- **Regulatory basis**: Bangladeshi law imposes few explicit farm-level record duties; the design targets what bites indirectly — the slaughter fitness certificate's 30-day treatment and 6-month disease look-backs, the transport card, the Safe Food Act buyer record, DLS registration, and written notifiable-disease reporting — and the DLS good-practice guideline templates. There is no national cattle ID and no national withdrawal table; both are the farm's own. Research with sources on branch `research/bangladesh-regulatory`. Two gaps remain open for the Manager: the notifiable-disease schedule (LSD status) and milk MRL numbers.
- **Offline engineering basis**: comparison of engines and patterns with sources on branch `research/offline-capture`; TanStack DB is beta and must be pinned.
- **Prototypes** (primary sources for the screen shapes, throwaway code): `prototype/sop-flow` (barn-staff milking flow; verdict: pen board tiles + full-screen keypad sheet) and `prototype/dashboard` (Owner/Manager home; verdict: exception list above KPI tiles).
- **ADRs**: 0001 immutable SOP Versions; 0002 offline outbox with oRPC as the only write path; 0003 Shed Phones with PIN-switched users.
- **Definition of done for Release 1**: every increment shipped; all 26 SOPs authored and running; OpenFarm declared as the farm's record-keeping method at a DLS renewal; one quarterly restore drill passed; 30 consecutive days with no paper register in use.
- **Next**: `/to-tickets` — slice this spec by increment, starting with increment 1.
