# Owner dashboard

Status: resolved

Type: prototype

Blocked by: —

Map: [OpenFarm Release 1](../map.md)

## Question

**Grilling.** Every model the dashboard would draw on is decided (milk, fattening, breeding, feed, finance, SOP instances). Decide what the Owner sees when they open the app, and what the Manager's home screen shows:

- Owner home: today's overdue/missed instances; milk to Bulk today vs 7-day average; discard litres; animals under withdrawal; Ready-for-Sale count and projected Eid weight; open needs-review and pending approvals; low stock; expected calvings this week. Which of these, in what order?
- Manager home: the sign-off queue, overdue instances, needs-review, today's instances by Pen.
- Trends: milk per cow per lactation, ADG per animal, feed cost per litre / cost of gain — daily/weekly/monthly.
- Are any of these Release 1, or is R1 the Inspector view + period reports only?

Resolved when the two home screens and the R1 trend set are written down. A `/prototype` may be cheaper than talking.

## Answer

Prototyped and reacted to on 2026-09-10. Prototype on branch **`prototype/dashboard`** (commit `1d5d3f6`, built on `prototype/sop-flow` so the switcher is shared): `apps/web/src/routes/prototype/dashboard.tsx` + `apps/web/src/prototype/dashboard-*`. Removed from `main`.

**Question**: what do the Owner and the Manager see when they open the app?

**Variants**: **A** exceptions-first (a prioritised action list, numbers secondary) · **B** KPI tile grid with trend bars and problem badges · **C** cards by side (Dairy / Fattening / Money or My queue).

**Verdict (Owner)**: **A's exception list on top, B's KPI tiles below.** C rejected — problems split across cards were harder to scan than one list.

### Home screens for the spec

**Owner home** — (1) _Needs you_: overdue instances (with escalation), Money Events awaiting approval, SOP proposals, withdrawal ending tomorrow, needs-review entries, low stock, DLS renewal due — each row with its action; empty list = "all fine". (2) _Tiles_: milk to Bulk today vs 7-day average with 7-session bars · tasks done/due ring · animals under withdrawal · discard litres · Ready for Sale with projected Eid weight · average daily gain and cost of gain · this month's income/expense · calvings this week / PD due / Repeat Breeder · feed stock status.

**Manager home** — (1) _My queue_: overdue instances (reassign / close as missed), sign-off queue, needs-review, withdrawal list, low stock. (2) _Tiles_: same as Owner **minus money**, plus **per-Pen progress today** (done/due per Pen).

### Trends in Release 1

Only what the tiles carry: 7-session milk bars, average daily gain, cost of gain, cost per litre, month-to-date money. **Per-lactation curves, per-animal ADG charts and monthly trend views are Release 2 candidates** (recorded under Out of scope); the period _reports_ (CSV) already give the data.

### Consequences

- Notifications and the home list are the same events, so one "attention" model feeds both.
- Offline: the Owner/Manager home is online-first (it reads farm-wide state); a cached last-known copy is shown with a sync-age banner when offline.
