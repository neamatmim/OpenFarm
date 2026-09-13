# 50 — The milk Dispatch

**What to build:** The Bulk milk leaves the farm to a buyer, and that hand-over is recorded: when, how many litres, which buyer, the challan number, and the fat and SNF if the processor gave them. It is the farm's milk-buyer record under the Safe Food Act, and the Dispatch record and the production report are generated from it. It was in the spec since increment 1 and never built; the milk sale's money comes from it, so it lands here.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — the Milk data model (`Dispatch`); [Report set](../../openfarm-release-1/assets/report-set.md) — R12 milk dispatch record, R13 milk production; roles matrix — Dispatch; `CONTEXT.md` — **Dispatch**, **Counterparty**.

- [ ] A Dispatch records the date, litres, buyer (a Counterparty found by name), challan number, price per litre, and optional fat %, SNF % and note; it is the Manager's to record and the Owner's to read
- [ ] Milk sent to Bulk and milk dispatched can be read side by side for a day, so milk that left and milk that was recorded going into the tank are not two stories
- [ ] R12, the milk dispatch record, is generated for a period as PDF and CSV with the buyer's name and address; R13, milk production, as CSV by day, session, Pen and Destination with discard under withdrawal shown; each export is an Audit Event
- [ ] Tests cover recording a Dispatch, reading it back beside the day's Bulk, both reports' contents, and the roles
