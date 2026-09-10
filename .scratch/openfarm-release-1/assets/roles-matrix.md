# Roles & permissions matrix — Release 1

Status: CONFIRMED by the Owner as drafted (2026-09-10)

Roles: **Owner**, **Manager**, **Staff** (Barn Staff), **Vet** (account scope: _full_ or _visiting_). A person may hold several roles; permissions are the union; every action records the role used.

Legend: **C** create · **R** read · **U** update/correct · **X** special action named in the cell · — none. "Own" = records the person created themselves, within the correction window decided in Audit trail.

| Area | Owner | Manager | Staff | Vet (full) | Vet (visiting) |
| --- | --- | --- | --- | --- | --- |
| **Users & roles** | C R U; approve invites | invite Staff, grant visiting-Vet access (Owner approves) | — | — | — |
| **Farm parameters** (lead times, thresholds, tolerances) | R U | R U | — | R | — |
| **Sheds & Pens** | C R U | C R U | R (own pens; others by lookup) | R | — |
| **Animals** — register, edit identity, photo | C R U | C R U | R (own pens; lookup any by tag); U photo | R | R (open cases only) |
| **Animals** — Move (pen / side) | X | X | X (record a move in own pens) | — | — |
| **Animals** — exits: Death/Cull | X | X | — | — | — |
| **SOP Definitions** | C R U; **publish** versions; approve proposals | R; **propose** changes | R (assigned SOPs) | R | — |
| **SOP Instances** | R all; reassign; close as missed | R all; **pin/reassign**; **close as missed** | R (own pens); **claim**; complete steps; skip animal with reason | R (health SOPs); complete Vet steps | complete steps on own cases |
| **Sign-off** | approve / send back (any) | approve / send back (as checker) | — | approve / send back (as checker on health SOPs) | — |
| **Milk Records & Bulk reconciliation** | R | R U | C (own pen); U own | R | — |
| **Dispatch** (milk to buyer) | R; approve above threshold | C R U | — | — | — |
| **Weigh-ins** | R | R U | C (own pen); U own | R | — |
| **Ready for Sale** | confirm | **confirm** | — | — | — |
| **Intake / Sale** | R; approve above threshold | C R U | — | — | — |
| **Health — Observation** | C R | C R U | C (own pens); U own | C R | C (open cases) |
| **Health — Diagnosis, Prescription** | R | R | R (treatment instances only) | **C U** | **C U** (own cases) |
| **Health — Treatment doses** | R | R | C (as SOP step); U own | C R U | C (own cases) |
| **Health — Vaccination / Deworming** | R | R; run campaigns | C (as SOP step) | C R U | — |
| **Drug List** | R | add product (withdrawal blank) | — | **C R U** incl. withdrawal days | R |
| **Withdrawal** | R | R | R (see the gate) | **shorten/end with reason** | — |
| **Notifiable-disease list** | R U | R U | — | R U | R |
| **Breeding** — Heat | R | R U | C (own pens) | R | — |
| **Breeding** — Service, PD, Abortion, Calving | R | C R U (Service, Calving) | C (Calving as SOP step) | C R U (PD, Abortion) | C (own cases) |
| **Repeat Breeder flag** | R | R; decide | — | R; decide | — |
| **Rations** | R U | **C R U** (versioned) | R (own pens) | R | — |
| **Feeding records** | R | R U | C (own pen); U own | — | — |
| **Feed stock, Purchases, Stock Count** | R; approve above threshold | C R U | — | — | — |
| **Money Events** | R; **approve above threshold** | C R U | — | C (own vet fee) | — |
| **Counterparties** | C R U | C R U | — | R | — |
| **Finance reports & accountant export** | R; export | R; export | — | — | — |
| **Compliance reports & exports** | R; export | R; export | — | R; export health reports | R (own cases) |
| **Audit log** | R all | R all | R own actions | R own actions | R own actions |
| **Notifications** (overdue, withdrawal, low stock…) | as configured | as configured | own instances, sent-backs | health events | own cases |

## Scope rules

- **Staff**: full access to animals and open instances in the pens they are assigned to; read-only lookup of any animal by Tag Number; never money; never other people's completions or performance.
- **Vet (visiting)**: only animals with an open case they are on, plus herd health summaries; access granted per visit by the Manager (Owner approves), time-limited.
- **Correction window**: Staff may correct their own entries within the window; after it, Manager only; corrections always keep the original (Audit trail ticket).
- **External parties** (accountant, buyers, auditors): no roles here — decided in External-party access.
