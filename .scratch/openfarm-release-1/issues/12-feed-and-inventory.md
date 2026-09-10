# Feed and inventory

Status: resolved

Type: grilling

Blocked by: 04

Map: [OpenFarm Release 1](../map.md)

## Question

**Grilling.** Decide the minimum feed model for R1 (scope reaffirmed as in R1):

- Rations: defined per group/state (milking, dry, fattening)? Ingredients and quantities, or just a named ration?
- Feeding as an SOP: does completing the feeding SOP record the quantity fed per group?
- Stock: feed types, purchases in, consumption out, stock-on-hand; alerts on low stock?
- Cost: per kg, allocated to groups/animals — needed now or for [Finance](./13-finance-in-release-1.md) later?

Resolved when the ration, feeding record, and stock model are written down — and anything deferred is moved to the map's fog.

## Answer

Decided with the Owner on 2026-09-10.

- **Feed Item** — a thing the farm feeds, with a unit (kg by default): green fodder, straw, silage, concentrate, minerals… Home-grown fodder is a Feed Item like any other.
- **Ration** — named, **per Pen**: a list of Feed Items with **kg per animal per day**, split across the two feeding sessions. Feeding target per session = pen headcount × kg ÷ sessions. Rations are **versioned like SOPs** (Manager edits create a new version; history shows what was fed under which ration).
- **Feeding** (SOPs 2 & 3, per Pen, twice daily): records **kg of each Feed Item actually given**, prefilled with the ration target so a normal day is two taps, plus an optional **refusal/leftover note**. Actual-vs-target and leftovers are the early warning for sick pens and over/under-feeding.
- **Stock**: **Purchases in** (Feed Item, qty, price, supplier, date) and **harvest in** for home-grown fodder at zero price; **consumption out** flows automatically from Feeding records; a **weekly physical Stock Count** (SOP 23) reconciles and corrects Stock on Hand; a **low-stock threshold per Feed Item alerts the Manager**.
- **Cost allocation** (simple, R1): weighted-average purchase price per kg × kg fed to the Pen, **split evenly across the Pen's animals by animal-days**. Yields cost-of-gain per fattening animal and feed cost per litre for dairy. Zero-price fodder contributes zero cost (its real cost is a Finance question).

### Assumed — correct me if wrong

- Weighted-average price is recomputed on each purchase; no FIFO batches in R1.
- A Stock Count difference is booked as an adjustment with a reason (spoilage, count error), never silently absorbed.

### Consequences

- Finance: feed purchases are a money event; per-animal feed cost is available for margins.
- Notifications: low-stock alert joins the event→recipient table.
- Offline: feeding entries are per Pen per session — low volume.

Unblocks → [Finance in Release 1](./13-finance-in-release-1.md).
