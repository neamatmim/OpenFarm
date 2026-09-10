# OpenFarm Release 1 — map

Label: wayfinder:map

Tracker: local-markdown (`.scratch/openfarm-release-1/`)

Charted: 2026-09-10

## Destination

A written spec for **OpenFarm Release 1**: an SOP-driven operations system for our 100–500 head dairy + fattening farm in Bangladesh — the farm's records _and_ its enforced procedures — with audit trail, roles & permissions, and DLS-compliant traceability. The map is done when every decision that spec needs is made and it can be handed to `/to-spec` → `/to-tickets`.

## Notes

- **Domain vocabulary** lives in [`CONTEXT.md`](../../CONTEXT.md). Every session consults it and updates it via `/domain-modeling` as terms resolve.
- **Skills**: `/grilling` + `/domain-modeling` for grilling tickets; `/research` (background agent) for research tickets; `/prototype` for the prototype ticket.
- **Farm facts** (decided during charting, not re-litigated): single farm, modelled so a second could exist later; Bangla default + English; roles Owner / Farm Manager / Barn Staff / Vet; cloud-hosted, phones lose signal in the barns; nothing systematic today so no migration; no hardware feeds in R1; no deadline — quality first.
- **Release 1 scope** — reaffirmed by the Owner after push-back: animal register, SOP engine, health/medicine, audit & roles, milk recording, fattening weights & sale, breeding, feed & inventory, finance. Sequencing _within_ R1 is the last ticket.
- **Stack**: TanStack Start + oRPC v2 + Drizzle/Postgres + Better Auth is preferred but open — a decision (e.g. offline) may change it. Record any such change as an ADR under `docs/adr/` (0001 SOP versioning, 0002 offline outbox, 0003 Shed Phones exist).
- **Research branches**: research findings land on `research/<name>` branches at `docs/research/<name>.md`; the ticket links them.
- Assets produced by tickets go in `.scratch/openfarm-release-1/assets/` and are linked from the ticket, never pasted in.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- [Release 1 sequencing](./issues/21-release-1-sequencing.md) — seven increments: (1) foundation + herd register + the milking SOP end-to-end + audit + offline + Bangla; (2) rest of daily Playbook + authoring + home screens + digests; (3) health & withdrawal; (4) fattening & sale; (5) breeding; (6) feed stock & finance; (7) Inspector view & registration. Prerequisites and owners listed; done = all shipped, 26 SOPs running, declared to DLS, restore drill passed, 30 paper-free days. Plan in `assets/release-1-increments.md`.

- [Staff onboarding and training](./issues/26-staff-onboarding-and-training.md) — farm-provided Shed Phones (Android 10+, Chrome) with a device session and per-person 4-digit PIN Switch (works offline, auto-lock 5 min); Owner/Manager/Vet on own phones; first run = Manager beside them + one-time Coach Overlays; one-page Bangla SOP Card per Version; Manager trains later hires and marks 'trained on' as an Audit Event.

- [Owner dashboard](./issues/25-owner-dashboard.md) — prototyped; verdict: exception list on top (overdue, approvals, withdrawal ending, needs-review, low stock, renewal), KPI tiles below (milk vs 7-day, tasks ring, withdrawal, discard, ready-for-sale + Eid projection, ADG/cost of gain, month money, breeding, feed); Manager home = queue + tiles minus money plus per-Pen progress; only tile-level trends in R1. Prototype on `prototype/dashboard`.

- [Backups and disaster-recovery targets](./issues/24-backups-and-disaster-recovery.md) — RPO ≤ 1 h, RTO ≤ 1 working day; managed Postgres with PITR + nightly encrypted off-site copy incl. photos, 90 nightlies, monthlies forever; quarterly restore drill verified via the Inspector view; Singapore region; Owner holds root credentials, Manager operational only; external dependencies listed.

- [Notification channels](./issues/23-notification-channels.md) — in-app + web push for everything; SMS only for withdrawal-ending and notifiable-diagnosis alerts to Manager and Owner; 16-row event→recipient table; safety and overdue immediate, the rest in 06:00/18:00 digests, quiet hours 22:00–05:00; overdue escalates to the Owner after 2 h.

- [Compliance reports and exports](./issues/19-compliance-reports-and-exports.md) — 15 reports/documents confirmed (Inspector view ×6, animal passport, buyer withdrawal summary, sale receipt, transport card, movement log, milk dispatch & production, DLS disease letter, accountant export); Bangla with English labels, A4, DLS column order; system generates the pre-filled ULO letter inside SOP 14; buyer summary shows treatments & clear/not-clear, no prices or diagnoses; every export audited. Set in `assets/report-set.md`.

- [DLS farm registration evidence](./issues/22-dls-farm-registration-evidence.md) — farm is registered; renewal is annual by 31 March; system holds the Registration record + certificate photo and auto-raises the renewal SOP 90 days before expiry; OpenFarm to be declared the record-keeping method; an Inspector view (registration, herd count, vaccination, 30-day treatments, 6-month disease history, mortality; each PDF) is what the Manager shows on inspection.

- [Audit trail and correction rules](./issues/16-audit-trail-and-correction-rules.md) — every state change is an append-only Audit Event in the same transaction (actor, role used, device+seq, both clocks, before/after); nothing deleted — corrections supersede with a reason; windows: Staff own 2 h, Manager 30 d, Owner always, Vet own health always; corrections re-run effects, irreversible effects flagged needs-review, sale corrections Owner-only; indefinite retention, ≥3 yrs guaranteed, off-site backups.

- [Prototype: Barn Staff phone flow for one SOP](./issues/20-prototype-barn-staff-sop-flow.md) — three variants built and reacted to; verdict: pen board of cow tiles (any order, locks on withdrawn cows, progress ring) with a full-screen keypad entry sheet; no change to the SOP model; prototype on branch `prototype/sop-flow`.

- [Bangla/English content and i18n approach](./issues/18-bangla-english-content-and-i18n.md) — English source strings, Manager-reviewed Bangla translation, build fails on missing Bangla; per-user language, Bangla default for Staff; SOP content authored in Bangla (required to publish), English optional per Version; Bangla numerals in Bangla UI, Gregorian dates with Bangla months, metric units with maund shown on feed purchases; icons on every step/evidence, photos everywhere; no voice in R1.

- [Offline capture and sync decision](./issues/17-offline-capture-and-sync-decision.md) — outbox on the existing stack (TanStack DB + offline-transactions), oRPC the only write path, batch procedure in one Drizzle transaction, client UUIDv7 + idempotency keys kept for weeks, (deviceId, seq) ordering, two clocks; offline = capture everything + read assigned pens' animals/state/withdrawal; online-only = authoring, finance, reports, Vet prescribing, admin; late entries accepted as `needs_review`, never overwrite; installed PWA, Capacitor only if eviction seen.

- [External-party access](./issues/15-external-party-access.md) — no external logins in R1: accountant gets exports, buyers get receipt/transport card/treatment summary documents, inspectors are shown records in person and handed PDF exports; everyone else is a Counterparty. The report set is the whole external surface.

- [Roles and permissions matrix](./issues/14-roles-and-permissions-matrix.md) — four roles, multi-role per person with the role used recorded; Staff scoped to their Pens + tag lookup, no money; Manager runs the day and proposes; Owner publishes and approves; one Vet role with full/visiting scope; ten named special actions. Matrix in `assets/roles-matrix.md`.

- [Finance in Release 1](./issues/13-finance-in-release-1.md) — income/expense record, not a ledger; Money Events for milk sales, cattle purchase/sale, feed, medicine, vet fees, wages, other — mostly derived from decided records; amount/category/Counterparty/payment method/linked record; Manager enters, Owner approves above a threshold; BDT, no VAT; monthly CSV/PDF for the accountant; derived fattening margin and dairy cost per litre; Counterparty is a shared buyer/supplier record.

- [Feed and inventory](./issues/12-feed-and-inventory.md) — Feed Items with unit; versioned Ration per Pen as kg/animal/day; Feeding records kg actually given per item per Pen (prefilled) + leftover note; stock = purchases/harvest in − consumption from Feeding, reconciled by weekly Stock Count, low-stock alert; cost = weighted-avg price × kg fed, split by animal-days.

- [Breeding and reproduction](./issues/11-breeding-and-reproduction.md) — Heat auto-raises AI due in 12–18 h; Service (AI or natural, sire, technician); Vet PD auto-due at 45 d, positive ⇒ Expected Calving = service + 283 d; dry-off due 60 d before, calving-prep 7 d before; Calving records ease, calf sex, live/stillborn, dam → Milking, calf created (stillborn created then Died); Abortion clears pregnancy; Repeat Breeder flag after 3 failed services; all lead times are farm parameters; Trigger model needs event-relative schedules.

- [Fattening weights and sale readiness](./issues/10-fattening-weights-and-sale.md) — intake records source, price, weight, est. age, photo, Target Window defaulting to next Eid; fortnightly weigh-in = scale reading typed per animal; ADG/days-on-feed/projection derived; Ready for Sale suggested by rule (target weight or window open), confirmed by Manager, blocked under meat withdrawal; Sale records buyer, price, weight, destination, transport and produces transport-card data + receipt; one sale per animal, batch sale deferred.

- [Milk recording](./issues/09-milk-recording.md) — litres per cow per Milking Session via the milking SOP; destination Bulk|Calves|Discard, forced to Discard under withdrawal; session bulk total reconciled against per-cow sum with a tolerance flag (default 5%); quality (fat, SNF, note) bulk-level only on the Dispatch; lactation starts at calving, ends at dry-off, number increments per calving.

- [Animal identity scheme](./issues/06-animal-identity-scheme.md) — farm's own numbers `D-0001…` (Dairy-born) / `F-0001…` (Fattening intake), never reused, prefix fixed at origin; optional Official Tag field; lost tag ⇒ same number, re-tag recorded; calves get identity at birth (tag pending); profile photo per animal shown wherever an animal is picked; existing animals re-numbered with old mark kept as alias.

- [Health, medicine and withdrawal model](./issues/08-health-medicine-and-withdrawal.md) — events Observation→Diagnosis(Vet)→Prescription(Vet)→Treatment dose→…; herd events = per-Pen instance with per-animal step; Vet-maintained drug list with milk/meat withdrawal days per product (blank ⇒ cannot prescribe); one Treatment instance per dose, withdrawal from last dose; hard gate on milk & sale; only Vet shortens withdrawal, audited; Vet records remotely themselves; notifiable diagnosis auto-raises the DLS report SOP.

- [Animal lifecycle, groups and movements](./issues/04-animal-lifecycle-and-groups.md) — one Side (Dairy|Fattening) + one State per Animal: Calf→Heifer→Pregnant Heifer→Milking⇄Dry; Quarantine→Fattening→Ready for Sale; exits Sold/Died/Culled; transitions via SOP effects or recorded moves; male calves → Fattening at weaning; Sheds contain Pens, every animal in exactly one Pen, SOPs run per Pen/Shed, pen moves are the movement event; mandatory: tag, sex, Side, Pen, source.

- [Shape of an SOP](./issues/05-shape-of-an-sop.md) — Definition → immutable Versions → Instances assigned to a role (Manager pins/reassigns); linear Steps with a per-animal repeat block; evidence = tick / number+unit / choice / photo / note; steps write farm records and animal state hard-gates other SOPs (withdrawal blocks milk & sale); checker approves or sends back; overdue → Manager alerted → open until done or closed as missed with reason; Owner authors, Manager proposes.

- [List the Playbook](./issues/01-list-the-playbook.md) — 26 SOPs confirmed complete (7 daily, 7 health, 5 reproduction, 3 fattening, 4 management); all three trigger kinds needed; milking 2×/day, feeding 2×/day, weigh-in fortnightly; roles as drafted. List in `assets/playbook-list.md`.

- [Bangladesh regulatory requirements for cattle, medicine and milk](./issues/02-bangladesh-regulatory-requirements.md) — few explicit farm duties: DLS registration, written notifiable-disease reporting, no drugs in feed, prescription-only antibiotics, keep milk buyer invoices. No national cattle ID (farm numbering is primary); no statutory withdrawal table (per-product from label); slaughter rules look back 30 days/6 months; retention guideline 3 years. Findings on `research/bangladesh-regulatory`.

- [Offline-first capture options on the OpenFarm stack](./issues/03-offline-capture-options.md) — recommended: outbox-first on the existing stack (TanStack DB + `@tanstack/offline-transactions`, idempotent writes via oRPC/Drizzle, installed PWA); PowerSync only if rich offline reads are needed; Zero/Replicache/Triplit/Jazz/LiveStore/Instant ruled out. Findings on `research/offline-capture`.

## Not yet specified

- **Calf rearing details** — colostrum protocol, weaning age parameter, calf health checks. Lifecycle states exist and SOP 19 covers newborn care; the remaining detail belongs in SOP steps, not a new model. Revisit when SOP steps are authored.

- **Batch sale** — one sale object covering several animals to one buyer (Eid). Deferred: R1 prefills buyer per animal and prints a combined receipt.

## Out of scope

- **Trend charts** (per-lactation milk curves, per-animal ADG charts, monthly trend views) — Release 2 candidates per [Owner dashboard](./issues/25-owner-dashboard.md); R1 shows tile-level trends and exports the data.
- **External logins and share links** (time-limited auditor login, per-sale buyer link, accountant portal) — ruled out of Release 1 in [External-party access](./issues/15-external-party-access.md); documents and exports cover every external need. Release 2 candidates.
- **Hardware / sensor feeds** (milking parlour, scales, RFID readers) — explicitly Release 2; R1 is manual entry.
- **Multi-farm product features** (tenancy, onboarding, billing) — the data model must not preclude them, but none are built.

## Frontier

**Map complete (2026-09-10).** Every decision ticket is resolved. The way to the destination is clear.

- [Tag the untagged animals and compile the opening register](./issues/07-tag-animals-and-opening-register.md) — `task`, HITL — stays open as a **go-live prerequisite**, not a decision; the spec lists it.

**Spec written**: [`spec.md`](./spec.md) (2026-09-10, `ready-for-agent`). **Tickets**: increment 1 sliced into 15 vertical tickets at [`../openfarm-r1-increment-1/issues/`](../openfarm-r1-increment-1/issues/) (2026-09-10). Increments 2–7 are ticketed when reached. **Next**: `/implement` from the frontier — ticket 01.
