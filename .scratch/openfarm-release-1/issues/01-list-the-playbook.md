# List the Playbook

Status: resolved

Type: task

Blocked by: —

Map: [OpenFarm Release 1](../map.md)

## Question

**HITL task — Owner and Farm Manager, with the agent taking dictation.**

The SOPs live in the Owner's and Manager's heads. Nothing about the SOP engine can be decided until we know what the procedures actually are.

Produce a list of every procedure the farm expects staff to follow (expected 10–25). For **each** one capture only:

- **Name** (Bangla and English)
- **Purpose** — one line
- **Trigger** — on a schedule (e.g. every milking, daily, weekly), on an event (new animal arrives, animal treated, calving), or on an animal's state (e.g. 7 days before expected calving)
- **Who does it** — which role
- **Who checks it** — which role signs off, if anyone

Do **not** write the steps yet — that's the next ticket's job once we know the shape. Save the list as `.scratch/openfarm-release-1/assets/playbook-list.md` and link it from the Answer.

Resolved when the list exists and the Owner says "that's all of them".

## Answer

The Playbook is **26 SOPs**, confirmed complete by the Owner ("the 26 are exactly right"). Full list with Bangla names, purpose, trigger, doer and checker: [`assets/playbook-list.md`](../assets/playbook-list.md).

**By group**: Daily routine (7) — milking, feeding dairy, feeding fattening, water check, shed cleaning, health walk, heat watch. Health (7) — sick report & isolation, treatment, withdrawal control, vaccination, deworming, mortality, DLS disease report. Reproduction (5) — AI, pregnancy check, dry-off, calving, newborn calf care. Fattening (3) — intake, weigh-in, sale. Management (4) — feed stock, milk dispatch, animal movement, DLS registration renewal.

**Trigger kinds present**: schedule (12), event (10), state (7) — several SOPs have two. So the SOP engine must support all three trigger kinds from Release 1.

**Concrete schedules**: milking 2×/day (early morning, afternoon); feeding 2×/day (morning, evening) for both sides; weigh-in every 2 weeks.

**Roles**: Staff do daily/handling work, Manager checks; Vet does prescriptions, pregnancy checks, vaccinations; Manager does intake, sale, mortality, DLS reports, Owner checks. One SOP (DLS renewal) is Owner-only with no checker.

**Observations for downstream tickets**: withdrawal control (#10) is a _state_-triggered SOP that gates two other SOPs (milking, sale) — the SOP model needs cross-SOP gating. Animal movement (#25) and calving (#18) create/alter animals, so SOPs must be able to write lifecycle events, not just evidence.

Unblocks → [Shape of an SOP](./05-shape-of-an-sop.md).
