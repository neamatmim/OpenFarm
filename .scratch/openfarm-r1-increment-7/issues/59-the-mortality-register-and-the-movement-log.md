# 59 — The mortality register and the movement log

**What to build:** Every death on the farm — the animal, the date, the cause, how the carcass was disposed of, and the DLS report reference when the disease was notifiable — as the mortality register (R6). A stillborn calf is on it: her calving writes her death with the cause "stillbirth", and the Manager adds the disposal afterwards, the register showing it as awaiting until then (the Owner's decision, 2026-09-13). And every movement of an animal in a period — Moves between Pens, Side changes, intakes, sales and deaths — as the movement log (R11) CSV an inspector asks for.

**Blocked by:** 56

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 7, user story 96; [Report set](../../openfarm-release-1/assets/report-set.md) — R6, R11; ticket 46's question about stillbirths; `CONTEXT.md` — **Mortality**, **Move**, **Intake**, **Sale**, **Calving**.

- [ ] A stillbirth records the calf's death with cause "stillbirth" and no disposal yet; the Manager records the disposal later; the register marks a death awaiting its disposal
- [ ] R6 lists deaths in a window: animal, date, cause, disposal method, DLS report reference if notifiable — in the Inspector View, as paper and CSV, each an Export
- [ ] R11 lists, for a period, every Move, Side change, intake, sale and death in time order, with the animal, from and to, and who recorded it — as CSV, an Export
- [ ] Tests cover a death with its notifiable reference, a stillbirth awaiting and then given its disposal, the movement log's kinds in order, and the Exports
