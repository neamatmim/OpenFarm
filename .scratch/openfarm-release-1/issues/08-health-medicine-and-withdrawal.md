# Health, medicine and withdrawal model

Status: resolved

Type: grilling

Blocked by: 02, 04

Map: [OpenFarm Release 1](../map.md)

## Question

**Research says** (see [Bangladesh regulatory requirements](./02-bangladesh-regulatory-requirements.md)): there is _no_ Bangladeshi withdrawal-period table for cattle — withdrawal days come from the product label / prescribing vet, so the drug list must carry them per product. At slaughter the vet may demand the prescription and withdrawal period for any treatment in the **30 days before slaughter** and the farm's disease history for **6 months**. Antibiotics are prescription-only and treatment must be by a BVC-registered practitioner — model the prescription as a first-class record. Steroids/hormones/antibiotics in feed are banned. Suspected notifiable disease must be reported to DLS in writing without delay — a candidate SOP trigger.

**Grilling + domain modeling.** Read [Bangladesh regulatory requirements](./02-bangladesh-regulatory-requirements.md) for withdrawal rules and record obligations.

Decide how health events are modelled and — critically — how withdrawal periods gate milk and sale:

- Events: diagnosis, treatment (drug, dose, route, who administered), vaccination, deworming, vet visit, death/cull. Which are Vet-only?
- Drug list: maintained by whom, with milk and meat withdrawal days per drug?
- **Gating**: when an animal is under milk withdrawal, does the system block/flag its milk being recorded into the saleable bulk? When under meat withdrawal, block sale? Hard block or warning-with-override (by whom, with reason)?
- Prescriptions: does the Vet prescribe in-system and Barn Staff administer as an SOP instance?
- Herd-level events (vaccination campaign) vs individual.

Scenarios: cow treated with antibiotics 2 days before sale; fattening animal given a drug with unknown withdrawal; vet not on site — who records?

Resolved when the health event model and the withdrawal gating rules are written down.

## Answer

Decided with the Owner on 2026-09-10. Gating is a **hard block** (already fixed in [Shape of an SOP](./05-shape-of-an-sop.md)); this ticket decides the model behind it.

### Health events (per Animal, attributed, audited)

| Event                               | Who may record                     |
| ----------------------------------- | ---------------------------------- |
| Observation (sick, lame, off-feed…) | Staff, Manager                     |
| Diagnosis                           | **Vet only**                       |
| Prescription                        | **Vet only**                       |
| Treatment given (a dose)            | Staff or Vet                       |
| Vaccination                         | Vet, or Staff under a campaign SOP |
| Deworming                           | Staff                              |
| Vet visit note                      | Vet                                |
| Death / Cull                        | Manager                            |

Herd-level events (vaccination campaign, pen deworming) are **one SOP instance per Pen with a per-animal repeat step**, so every Animal gets its own event; skips recorded with a reason. Per-animal history stays complete for the slaughter fitness certificate (30-day treatment look-back, 6-month disease history).

### Drug list

A farm-maintained list of products with **milk withdrawal days** and **meat withdrawal days** per product (there is no national table — values come from the label). The **Vet maintains it**; the Manager may add a product when it is bought, with withdrawal days blank. **A product with blank withdrawal cannot be prescribed.**

### Prescription → treatment

A Prescription is drug, dose, route, frequency, duration for one Animal. The system **creates one Treatment SOP instance per dose** on the schedule (e.g. daily × 3 → three dated instances), each with "give dose" evidence. Missed doses are visible as overdue instances. **The withdrawal period starts from the last dose actually given.**

### Withdrawal & gating

Recording a dose puts the Animal **under withdrawal** (milk until D+milk-days, meat until D+meat-days). While under milk withdrawal her per-animal milking step is hard-blocked from bulk (milk recorded as discarded); under meat withdrawal the sale SOP refuses to complete. **Only the Vet can shorten or end a withdrawal, with a reason, and the change is audited.**

### Vet off-site

The Vet records Diagnosis and Prescription **themselves, from their own phone**, wherever they are. No recording "on behalf of" the Vet — the prescription is legally the Vet's act (antibiotics require a registered practitioner's prescription; BVC Act 2019). Consequence: the Vet role needs a working remote login and the offline story must cover a Vet who is not at the farm.

### Notifiable disease

The farm keeps a **notifiable-disease list** (seeded from the Animal Disease Rules once the schedule is confirmed — see research gap). A Vet Diagnosis on that list **auto-creates the "Notifiable disease report to DLS" SOP instance for the Manager, due immediately** ("without delay", Animal Disease Act 2005 s.3).

### Consequences for other tickets

- Roles matrix: Vet-only recording; Vet-only withdrawal override; Manager-only death/cull.
- Milk recording: discarded milk under withdrawal is recorded, not lost.
- Compliance reports: per-animal treatment history with prescription + withdrawal; 30-day and 6-month look-backs.
- Offline: Vet's remote entries are online-first; Staff's dose entries must work offline and the gate must use the last-synced withdrawal state.

Unblocks → [Roles and permissions matrix](./14-roles-and-permissions-matrix.md). [Compliance reports and exports](./19-compliance-reports-and-exports.md) still waits on [DLS farm registration evidence](./22-dls-farm-registration-evidence.md).
