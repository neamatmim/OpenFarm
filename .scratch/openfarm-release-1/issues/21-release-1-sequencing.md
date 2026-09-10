# Release 1 sequencing

Status: resolved

Type: grilling

Blocked by: 11, 13, 15, 16, 17, 18, 19, 20, 23, 24, 25, 26

Map: [OpenFarm Release 1](../map.md)

## Question

**Note (2026-09-10)**: originally blocked on the tagging task; un-wired — tagging is a go-live prerequisite to be _listed_ by this decision, not a decision it waits on.

**Grilling.** Everything is in Release 1 by decision, but not everything ships on day one. With all domain decisions made, decide the order of increments _within_ R1:

- What is the thinnest increment Barn Staff can use on the farm (recommended: animal register + one SOP end-to-end + audit)?
- Order of the rest by value and dependency.
- What "done" means for R1 as a whole.

Resolved when the increment order is written down. This is the last decision — after it, the map is complete and the spec can be written with `/to-spec`.

## Answer

Decided with the Owner on 2026-09-10 — the last decision on the map. Full plan: [`assets/release-1-increments.md`](../assets/release-1-increments.md), confirmed as drafted.

**Increment 1 — the thinnest thing that makes OpenFarm the farm's record-keeping method**: users & roles, Shed Phones with PIN Switch, Sheds/Pens, the Animal register (Tag Numbers, photos, Side/State, Moves), **the milking SOP end-to-end** (Definition → Version → daily Instances → per-cow tiles → litres → Bulk reconciliation → Manager sign-off → overdue alert), Milk Records, audit trail with corrections, the offline outbox, Bangla UI. Milking first because it runs twice a day on every cow — the most valuable record and the hardest test of the engine, the tiles and offline.

**Then, in order**: **2** the rest of the daily Playbook + SOP authoring/proposals + SOP Cards + Owner/Manager home + digests/escalation → **3** health & withdrawal (Vet remote login, gates on milking and sale, campaigns, mortality, DLS letter, SMS safety alerts) → **4** fattening & sale (intake, weigh-ins, Eid projection, readiness, sale receipt & transport card, passport) → **5** breeding → **6** feed stock & finance (purchases, counts, allocation, Money Events, approvals, accountant export, margins) → **7** Inspector view & registration. Cross-cutting from day one: audit on every write, Bangla-required build check, PITR backups, restore drill scheduled at increment 1 go-live.

**Go-live prerequisites** (owners confirmed): tag every animal and compile the opening register (Manager + Staff — [ticket 07](./07-tag-animals-and-opening-register.md), still open as a task); enter DLS registration details (Manager); write the milking SOP's steps in Bangla, then the rest (Owner + Manager); buy Shed Phones (Owner); provision Singapore hosting, PITR Postgres, off-site backups, DNS/TLS with the Owner holding credentials; before increment 3: SMS gateway (Owner) and notifiable-disease list confirmed with the ULO (Manager).

**Definition of done — Release 1**: every increment shipped; all 26 SOPs authored and running; OpenFarm declared as the farm's record-keeping method at a DLS renewal; one quarterly restore drill passed; **30 consecutive days with no paper register in use**.

The map is complete. Hand off: `/to-spec` on `.scratch/openfarm-release-1/` (map, 26 tickets, 5 assets, `CONTEXT.md`, ADRs 0001–0003, research branches, prototype branches).
