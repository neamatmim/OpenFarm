# Finance in Release 1

Status: resolved

Type: grilling

Blocked by: 09, 10, 12

Map: [OpenFarm Release 1](../map.md)

## Question

**Grilling.** Scope reaffirmed as in R1 — decide _how much_ finance:

- Money events the system records: milk sales, cattle purchases, cattle sales, feed purchases, medicine, wages, other expenses. Which in R1?
- Is this a ledger (double-entry, reconciles with the accountant) or a record of farm-level income/expense with simple reports?
- Per-animal economics (cost of gain, margin per fattening animal) — needed in R1 or later?
- Currency, VAT, cash vs bank — anything the accountant requires?
- Who enters money — Manager/Owner only?

Resolved when the R1 finance scope and the money-event model are written down; deferred items go to the map's fog or Out of scope.

## Answer

Decided with the Owner on 2026-09-10. Finance is an **income/expense record, not a ledger**.

### Money Events in Release 1

| Money Event | Comes from | Extra entry? |
| --- | --- | --- |
| Milk sale | Dispatch (litres × price, buyer) | price only |
| Cattle purchase | Intake (purchase price, seller) | none |
| Cattle sale | Sale (price, buyer) | none |
| Feed purchase | feed Purchase (qty × price, supplier) | none |
| Medicine purchase | adding/buying a Drug List product (qty, price, supplier) | price, supplier |
| Vet fee | Vet visit note (fee) | fee |
| Wages & labour | free entry (person/role, period, amount) | full |
| Other expense / income | free entry with category (utilities, repairs, transport, manure sales…) | full |

Every Money Event has: amount (BDT), date, direction (in/out), **category**, **counterparty**, **payment method** (cash / bKash / bank), optional receipt photo, and a **link to the farm record that caused it** where one exists.

### Rules

- **Manager enters; Owner approves entries above a threshold** (farm parameter). Below it, entries are visible to the Owner but need no approval.
- **BDT only. No VAT** in R1.
- **Counterparty** is a shared record — buyers, suppliers, vets, labourers — with name, address, phone; reused across Sale, Dispatch, Intake, feed/medicine Purchase and free entries. This is the Safe Food Act s.38 name-and-address record.
- **Reports**: monthly and any period — income vs expense by category, by counterparty, by Side (Dairy / Fattening). **Monthly CSV and PDF export** for the accountant, who keeps the books.
- **Per-animal economics** (derived): fattening margin = sale − purchase − allocated feed − allocated medicine; dairy **cost per litre** = (allocated feed + medicine) ÷ litres to Bulk. Shown on the animal and in period reports.

### Assumed — correct me if wrong

- Approval threshold default BDT 20,000.
- Wages are recorded as a monthly entry per person, not per shift.
- Medicine cost is allocated to the animal treated (per dose), vet fees to the animal(s) on the visit note.

### Consequences

- Roles: Manager creates Money Events; Owner approves; Vet enters fees only; external accountant gets exports, not a login (to confirm in External-party access).
- Compliance: Dispatch + Counterparty = milk buyer record; Intake/Sale + Counterparty = cattle movement counterparties.
