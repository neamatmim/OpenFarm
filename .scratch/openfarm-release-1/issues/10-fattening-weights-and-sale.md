# Fattening weights and sale readiness

Status: resolved

Type: grilling

Blocked by: 04

Map: [OpenFarm Release 1](../map.md)

## Question

**Grilling.** Decide the fattening record model:

- Intake: purchase weight, price, source, date; expected sale window (Eid-driven?).
- Weigh-ins: cadence, who, how measured without a scale feed in R1 (crush scale reading typed in? girth tape estimate?).
- Derived: average daily gain, days on feed, projected weight at target date.
- **Ready for sale**: a rule (target weight/days) or a Manager judgement? Who marks it?
- Sale event: buyer, price, weight at sale, and the withdrawal gate from [Health model](./08-health-medicine-and-withdrawal.md).

Resolved when the weight record, readiness rule, and sale event are written down.

## Answer

Decided with the Owner on 2026-09-10.

- **Intake** (SOP 20, Manager): source (seller name/place), purchase price, **intake weight**, estimated age, breed (optional), profile photo, and a **Target Window** per animal defaulting to the **next Eid-ul-Adha**. Assigns the `F-` Tag Number and the Quarantine Pen; the animal enters as `Quarantine`.
- **Weigh-in** (SOP 21, Staff, every 2 weeks, per fattening Pen with a per-animal step): a **scale reading typed in** as the step's number evidence (kg), with a sane range that warns on implausible jumps. Method is recorded as _scale_; if a girth-tape fallback is ever added, its readings are flagged _estimated_.
- **Derived, never typed**: average daily gain (per animal, per period and since intake), days on feed, and **projected weight at the Target Window**.
- **Ready for Sale**: the system **suggests** an animal when _target weight reached_ **or** _Target Window open_; the **Manager confirms**, which is the state change. **Cannot be marked ready under meat withdrawal.** Target weight is per animal (set at intake, editable).
- **Sale** (SOP 22, Manager, Owner checks): buyer (name, address, phone), sale price, **weight at sale**, date, destination, transport details (vehicle, driver). Hard-gated by meat withdrawal. Produces the **transport-card data** (farm of origin, animal count, destination — Meat Rules 2021 r.18) and a **sale receipt**; the animal exits as `Sold`. The animal's Pen history supplies the slaughter certificate's 30-day location.

### Assumed — correct me if wrong

- **One Sale event per animal.** When several animals go to one buyer on one day (typical at Eid), the app prefills the buyer and transport details for the next sale, and a receipt can list all of that day's sales to that buyer. A true "batch sale" object is deferred to fog.
- Target weight default: a farm parameter by breed/age class, overridable per animal.

### Consequences

- Finance: purchase price at intake and sale price at sale are the two money events per fattening animal; margin per animal = sale − purchase − allocated feed/medicine.
- Compliance reports: transport card and per-animal 30-day location come straight from Sale + Pen history.

Partially unblocks → [Finance in Release 1](./13-finance-in-release-1.md) (still waits on feed).
