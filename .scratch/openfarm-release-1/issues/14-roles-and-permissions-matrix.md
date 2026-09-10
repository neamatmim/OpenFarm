# Roles and permissions matrix

Status: resolved

Type: grilling

Blocked by: 05, 08

Map: [OpenFarm Release 1](../map.md)

## Question

**Grilling.** Roles known: Owner, Farm Manager, Barn Staff, Vet. Using the SOP model and health model, decide the matrix:

- Per area (animals, SOPs, milk, weights, health, breeding, feed, finance, audit): who can view / create / edit / sign off / configure.
- Can Barn Staff see other staff's tasks? Whole-herd data?
- Vet: in-house vs visiting — same role, different scope?
- Is a person one role, or can the Manager also milk?
- Who creates users and assigns roles?

Resolved when the matrix is written down as a table.

## Answer

Decided with the Owner on 2026-09-10. The full matrix (area × role, with C/R/U and named special actions) is the asset [`assets/roles-matrix.md`](../assets/roles-matrix.md), confirmed as drafted.

**Roles**: Owner, Manager, Staff, Vet. A **person may hold several roles**; permissions are the union; **every action records the role used**.

**Scope rules**

- **Staff** see everything in the Pens they are assigned to (animals, open instances) and can look up any animal by Tag Number read-only; they never see money or other people's completions. They claim, complete, skip-with-reason, record moves in their pens, and correct their own entries within the correction window.
- **Manager** runs the farm day-to-day: pins/reassigns/closes-as-missed, is checker on most SOPs, confirms Ready for Sale, records intake/sale/dispatch/purchases/money, maintains rations and parameters, **proposes** SOP changes, invites Staff and grants visiting-Vet access (Owner approves).
- **Owner** has everything, **publishes** SOP versions, approves proposals, invites and money above the Approval Threshold, and administers users.
- **Vet** is one role with account scope **full** or **visiting**. Both diagnose, prescribe, maintain the Drug List (only the Vet sets withdrawal days), shorten withdrawal with a reason, and act as checker on health SOPs. **Visiting** scope is limited to animals with an open case they are on plus herd health summaries, granted per visit and time-limited.

**Named special actions** the system must model as distinct permissions: claim · pin/reassign · approve/send back · close as missed · propose · publish · confirm Ready for Sale · shorten withdrawal · approve above threshold · grant visiting access.

Unblocks → [External-party access](./15-external-party-access.md).
