# Release 1 — increments

Status: CONFIRMED by the Owner as drafted (2026-09-10) — increments, order, prerequisites and definition of done. Everything below is in Release 1 by decision; this is the order it reaches the farm.

Principle: each increment is usable on the farm the day it ships, replaces a piece of paper or memory, and never has to be undone. Increment 1 is the thinnest thing that makes OpenFarm _the_ record-keeping method.

| # | Increment | What barn staff / manager get | Draws on |
| --- | --- | --- | --- |
| **1** | **Foundation + herd + one SOP** | Users & roles; Shed Phones with PIN Switch; Sheds/Pens; Animal register with Tag Numbers, photos, Side/State, Moves; **the milking SOP end-to-end** (Definition → Version → daily Instances → per-cow tiles → litres → Bulk reconciliation → Manager sign-off → overdue alert); Milk Records; **audit trail and corrections**; offline outbox; Bangla UI. | Playbook, SOP shape, lifecycle, identity, milk, roles, audit, offline, i18n, prototype, onboarding |
| **2** | **The rest of the daily Playbook** | Feeding (rations, kg per pen), water, shed cleaning, health walk, heat watch, animal movement SOPs; SOP authoring & proposals for the Owner/Manager; SOP Cards; Owner & Manager home (exception list + tiles); digests, quiet hours, escalation. | Feed (rations only), notifications, dashboard |
| **3** | **Health & withdrawal** | Observation → Diagnosis → Prescription → dose instances; Drug List; withdrawal gates on milking and sale; vaccination/deworming campaigns; mortality; notifiable-disease letter; Vet remote login; SMS for the two safety alerts. | Health model, regulatory, reports (R4–R6, R14) |
| **4** | **Fattening & sale** | Intake with Target Window; fortnightly weigh-ins; ADG & Eid projection; Ready-for-Sale suggestion & confirmation; Sale with receipt & transport card; Animal Passport & buyer withdrawal summary. | Fattening, identity (F- numbers), reports (R7–R10) |
| **5** | **Breeding** | Heat → AI due window → Service → PD due → Expected Calving → dry-off & calving-prep SOPs → Calving creates calf → lactation numbering; abortion; Repeat Breeder flag. | Breeding, lifecycle |
| **6** | **Feed stock & finance** | Purchases, harvest-in, consumption from feeding, weekly Stock Count, low-stock alerts, feed cost allocation; Money Events from all records + wages/other; approvals above threshold; Counterparties; accountant export; per-animal margin & cost per litre. | Feed stock, finance, reports (R12, R13, R15) |
| **7** | **Inspector view & registration** | Registration record + renewal SOP; Inspector view with all six registers and PDF export; movement log; trained-on records. | DLS registration, reports (R1–R6, R11), onboarding |

Cross-cutting from increment 1: audit events on every write; Bangla-required build check; backups with PITR from the day the database exists; restore drill scheduled at increment 1 go-live.

## Go-live prerequisites (before increment 1 reaches the barn)

| Prerequisite | Who | From ticket |
| --- | --- | --- |
| Tag every animal per the D-/F- scheme; photo each; compile the opening register (CSV) | Manager + Staff | Tag animals & opening register |
| Enter DLS registration details and certificate photo | Manager | DLS registration evidence |
| Write the **steps** of the milking SOP in Bangla (increment 1), then the rest of the Playbook (increment 2) | Owner + Manager | List the Playbook → SOP shape |
| Buy 1–2 Shed Phones per shed (Android 10+), wall mounts, chargers | Owner | Onboarding |
| Provision hosting (Singapore), managed Postgres with PITR, off-site backup bucket, DNS/TLS; Owner holds credentials | Owner (+ builder) | Backups & DR |
| Sign up an SMS gateway (increment 3) | Owner | Notifications |
| Confirm the notifiable-disease list with the ULO (increment 3) | Manager | Health model / regulatory gap |

## Definition of done — Release 1

Every increment shipped; the 26-SOP Playbook fully authored and running; the farm has declared OpenFarm as its record-keeping method at a DLS renewal; one quarterly restore drill passed; 30 consecutive days with no paper register in use.
