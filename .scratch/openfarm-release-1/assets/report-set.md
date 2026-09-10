# Release 1 report & document set

Status: CONFIRMED by the Owner as drafted (2026-09-10). This is the entire external surface — no external party logs in. Format: Bangla by default with English field labels alongside; A4; DLS guideline column order where one exists.

| # | Report / document | Audience | Trigger | Content (source of each field is a decided record) | Format |
| --- | --- | --- | --- | --- | --- |
| **Inspector view (DLS)** |  |  |  |  |  |
| R1 | Registration | Inspector | on demand | number, office, issue/expiry, certificate photo | screen + PDF |
| R2 | Herd summary | Inspector | on demand | count by Side × State; by Pen; date | screen + PDF |
| R3 | Vaccination register | Inspector | on demand / period | per animal: vaccine, date, batch, who; DLS guideline template order | PDF, CSV |
| R4 | Treatment register (30-day look-back, any window) | Inspector; slaughter vet | on demand / period | per animal: date, diagnosis, drug, dose, route, who gave, prescribing Vet, milk & meat withdrawal end — DLS guideline 11-field template | PDF, CSV |
| R5 | Disease history (6-month look-back, any window) | Inspector; slaughter vet | on demand / period | diagnoses by date and animal; notifiable ones marked; outcomes | PDF |
| R6 | Mortality register | Inspector | on demand / period | animal, date, cause, disposal method, DLS report ref if notifiable | PDF, CSV |
| **Per-animal** |  |  |  |  |  |
| R7 | Animal passport | Buyer (on request); slaughter vet | on demand | tag, photo, sex, breed, age, source, Pen history (incl. last 30 days' location), treatments & withdrawal status, vaccinations, weigh-ins | PDF |
| R8 | Treatment & withdrawal summary | Buyer | at sale / on request | tag, treatments in last 30 days with prescriptions, withdrawal end dates, "clear" or "not clear" | PDF |
| **Movement & sale** |  |  |  |  |  |
| R9 | Sale receipt | Buyer; Finance | at Sale | animals (tag, weight, price), buyer, date, farm identity, total; several animals to one buyer on one day on one receipt | PDF (print) |
| R10 | Transport card data | Buyer's transporter | at Sale | farm of origin (name, address, Registration no.), animal count and tags, destination, date/time, driver/vehicle if known — Meat Rules 2021 r.18 | PDF (print) |
| R11 | Movement log | Inspector | period | all Moves incl. side changes, intakes, sales, deaths | CSV |
| **Milk** |  |  |  |  |  |
| R12 | Milk dispatch record | Processor; BFSA (s.38) | period | per Dispatch: date, litres, buyer name/address, challan no., fat/SNF if recorded | PDF, CSV |
| R13 | Milk production | Owner | period | litres per day/session by Pen and Destination; discard under withdrawal | CSV |
| **Statutory reporting** |  |  |  |  |  |
| R14 | Notifiable disease report to the ULO | DLS (ULO) | Vet diagnosis on the notifiable list → SOP 14 | farm identity & Registration no., animals affected, diagnosis, date, Vet, actions taken, contact | PDF letter (Bangla), printed/hand-delivered |
| **Finance** |  |  |  |  |  |
| R15 | Accountant export | Accountant | monthly | all Money Events: date, direction, amount, category, Counterparty, payment method, linked record | CSV + PDF summary |

Rules across the set: every generated export is an Audit Event (who, when, which report, which window); every PDF carries the farm name, Registration number, generation timestamp and generating user; Bangla numerals follow the generating user's language setting except where an authority template dictates.
