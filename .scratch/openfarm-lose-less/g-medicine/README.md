# G — Medicine and the law

Survey "smaller or waiting" items (`../survey.md`), chosen by the Owner 2026-09-30.

**What the app already does** (read from the code, 2026-09-30):

- A **Treatment** reaches an animal two ways only: a dose of a **Prescription** (the Vet's alone, from their own
  account, answering a Diagnosis, `routers/prescriptions.ts:157-227`) or a dose of a **Campaign** (`effects/treatment.ts`).
  A Treatment Step with neither is refused (`effects/treatment.ts:223-230`). **No Role can record a dose from the
  pharmacy**: it goes into the animal with no record, no stock taken and **no Withdrawal** — while every milk and sale
  gate hangs off `recomputeWithdrawal` (`health-store.ts:265-306`; milk `milk-store.ts:111-117`, sale `sale.ts:166-174`).
- Withdrawal days live on the Drug List product, blank until the Vet writes them (`schema/health.ts:30-62`); a product
  with blank days adds no hold (`health-store.ts:236-244`).
- A Diagnosis names its disease as free text (`vet/diagnosis-sheet.tsx:156-165`, Bangla only sent). A Notifiable Disease
  is matched on the exact words, lower-cased (`isNotifiable`, `health-store.ts:482-502`): "FMD", "খুরা রোগ" or "Foot
  and mouth disease" miss "ক্ষুরা রোগ"/"Foot-and-mouth disease", and **no DLS Report is raised**.
- Medicine Stock on Hand is doses bought less doses given (`medicine-stock.ts:55-131`); **it is never counted**, so a
  pharmacy dose, spillage or theft never shows. The feed store's weekly **Stock Count** is the pattern
  (`effects/stock-count.ts`, `stock-store.ts:483-600`, `shortfallOf`).

| #   | Ticket                                   | Blocked by |
| --- | ---------------------------------------- | ---------- |
| 01  | A dose not prescribed, and its Withdrawal | —          |
| 02  | Diseases picked from the list             | —          |
| 03  | The monthly medicine count                | 01         |

**Settled with the Owner, 2026-09-30, and not to be re-asked:**

- **A pharmacy dose is recorded, and holds her** (G1): a product whose days the Vet has not written takes a cautious
  farm-wide hold **the Vet sets** until the product's own days are written. The Vet is told of every such dose at once.
- **Medicine is counted monthly** (G3): first Friday of the month, the Manager counts doses per product blind, the Owner
  checks; a shortfall over the Owner's ৳ line is told to the Owner.

**Settled in drafting** (the Owner may overrule):

- Recorded by the Owner or the Manager (not Barn Staff): the Manager is who goes to the pharmacy.
- Until the Vet has set the farm-wide hold, a dose of a product with blank days is **refused** with "ask the Vet" — the
  days are the Vet's to answer for; the go-live withdrawal sheet gains a line for it.
- The Vet may shorten such a Withdrawal as any other (the existing gate), with a reason.
- The disease picker keeps "another disease" as free text; the notifiable list gains **other names** (aliases) so old
  words still match.
- The count is per product, not per Lot (Lots are kept by first-to-expire); active products only.
