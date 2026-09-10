# Animal lifecycle, groups and movements

Status: resolved

Type: grilling

Blocked by: —

Map: [OpenFarm Release 1](../map.md)

## Question

**Grilling + domain modeling.** Update `CONTEXT.md` as terms resolve.

Decide the states an Animal moves through and the groupings the farm actually manages by.

- What are the lifecycle states? (e.g. calf → heifer → milking cow → dry cow; fattening intake → fattening → ready for sale → sold; dead/culled.) What transitions are allowed, and what event causes each?
- Do calves born to Dairy go to Fattening? When, and by what rule?
- How is the herd physically grouped — sheds, pens, batches? Do SOPs apply to groups or to individual animals (or both)?
- What happens when an animal moves between Dairy and Fattening, or between pens — is that a recorded event?
- Sex, breed, birth date, source (born here / bought) — which are mandatory to know an animal at all?

Stress-test with scenarios: a bought-in pregnant heifer; a dairy cow that stops producing and is fattened; a fattening animal that dies; twins.

Resolved when the state machine, the grouping model, and the mandatory identity fields are written down.

## Answer

Decided with the Owner on 2026-09-10.

### Lifecycle (state machine)

Every Animal has exactly one **Side** (Dairy | Fattening) and one **State**:

- **Dairy**: `Calf` → `Heifer` → `Pregnant Heifer` (first service confirmed) → `Milking` (first calving) → `Dry` (dry-off) → `Milking` (next calving) → …
- **Fattening**: `Quarantine` (intake) → `Fattening` → `Ready for Sale` → exit.
- **Exits** from any state: `Sold`, `Died`, `Culled`. An exited Animal keeps its full history and is never deleted.

Transitions are caused by **SOP effects** (calving, dry-off, intake, sale, mortality) or by a **recorded move** by the Manager. Side changes are moves: a Dairy female can move to Fattening (State becomes `Fattening`); a bought-in pregnant heifer enters Dairy directly as `Pregnant Heifer`. Twins = two `Calf` records from one calving, both linked to the dam.

**Calves born on Dairy**: females stay Dairy as `Calf` → `Heifer`; **males move to Fattening after weaning** — a state trigger.

### Grouping

**Sheds** contain **Pens**. Every Animal is in exactly one Pen at all times. SOP Instances run **per Pen or per Shed** (milking for the milking pens; feeding per pen with the pen's ration; weigh-in per fattening pen). **Moving an Animal between Pens is the recorded movement event** (SOP 25) — including Dairy ↔ Fattening.

### Mandatory to register an Animal

Tag · sex · Side · current Pen · source (born here | bought). Breed, birth date / estimated age, photo are optional and can be added later. (Tag rules are decided in [Animal identity scheme](./06-animal-identity-scheme.md).)

### Assumed — correct me if wrong

- **Weaning age ~3 months** is the trigger for the male-calf move; it's a farm parameter, not hard-coded.
- **Pregnancy in a cow that has already calved is a fact** (service date, PD result, expected calving) carried on a `Milking` or `Dry` cow, not a separate State. `Pregnant Heifer` exists only because a heifer's first pregnancy changes what SOPs apply to her.
- `Culled` is an exit for animals removed for non-productivity/illness; if the cull ends in a sale the sale record is still made.

### Scenarios checked

Bought-in pregnant heifer → Dairy, `Pregnant Heifer`, source = bought, Pen assigned at intake. Dairy cow that stops producing → Manager moves her to a Fattening Pen; Side = Fattening, State = `Fattening`; her lactation history stays. Fattening animal dies → `Died` via the mortality SOP with cause and disposal. Twins → two `Calf` records, one calving event.

Unblocks → [Animal identity scheme](./06-animal-identity-scheme.md), [Health, medicine and withdrawal](./08-health-medicine-and-withdrawal.md), [Milk recording](./09-milk-recording.md), [Fattening weights and sale](./10-fattening-weights-and-sale.md), [Breeding and reproduction](./11-breeding-and-reproduction.md), [Feed and inventory](./12-feed-and-inventory.md).
