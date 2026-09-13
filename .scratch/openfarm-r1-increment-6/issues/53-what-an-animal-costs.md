# 53 — What an animal costs, and what a litre costs

**What to build:** The Owner wants to know which side of the farm makes money. Feed is charged to the animals that ate it — the Feed Item's weighted-average price times the kg fed to a Pen, split across the animals standing in it by animal-days — and medicine is charged to the animal treated, a dose at a time. From those come each fattening animal's margin and the dairy side's cost per litre, on the animal's page and in the period report.

**Blocked by:** 48, 51

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 6, user stories 76 and 81; [Feed and inventory](../../openfarm-release-1/issues/12-feed-and-inventory.md) (cost allocation); [Finance in Release 1](../../openfarm-release-1/issues/13-finance-in-release-1.md) (per-animal economics); `CONTEXT.md` — **Feeding**, **Money Event**.

- [ ] A Pen's feed cost for a session is its Feedings' kg times each Feed Item's weighted-average price at the time, split evenly across the animals in the Pen by animal-days; home-grown fodder at no price costs nothing, and the report says so
- [ ] A dose given costs the product's recent purchases' price divided by the doses they held (the Owner's decision, 2026-09-13), charged to the animal who had it; a dose of a product never bought is shown as uncosted rather than as free
- [ ] A fattening animal's margin is her sale price minus her purchase price, allocated feed and allocated medicine; a dairy cow's cost per litre is her allocated feed and medicine divided by her litres to Bulk; both are derived, never stored
- [ ] Both show on the animal's page to the Owner and Manager, and in a period report by Side; Barn Staff and the Vet see none of it
- [ ] Tests cover a Pen's feed split across two animals over different days, a costed and an uncosted dose, a sold fattening animal's margin, and a cow's cost per litre
