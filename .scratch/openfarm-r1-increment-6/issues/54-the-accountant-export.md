# 54 — The accountant's export

**What to build:** The farm does not keep books; its accountant does, from what the farm sends. Once a month — or for any period — the Owner or Manager generates every Money Event as CSV, and a PDF summary of income against expense by Category, by Counterparty and by Side. Money the Owner has not approved is in it, and marked so.

**Blocked by:** 51, 52

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 6, user story 80; [Report set](../../openfarm-release-1/assets/report-set.md) — R15 accountant export; [Finance in Release 1](../../openfarm-release-1/issues/13-finance-in-release-1.md) (reports); `CONTEXT.md` — **Money Event**, **Category**, **Counterparty**.

- [ ] The CSV holds every Money Event in the period: date, direction, amount, Category, Counterparty, payment method, the linked record, and whether it is approved
- [ ] The PDF summary gives income and expense by Category, by Counterparty and by Side, Bangla by default with English labels, and carries the farm's name, Registration number, when it was generated and by whom
- [ ] Generating either is an Audit Event naming the report and the period; it is the Owner's and the Manager's, and online-only
- [ ] Tests cover a month with records' and hand-entered Money Events, an unapproved one marked, the totals by Category and Side, and the export on the trail
