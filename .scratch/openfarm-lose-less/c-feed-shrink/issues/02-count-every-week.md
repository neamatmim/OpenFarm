# 02 — The count every week, and a missed count

**What to build:** The count is raised by the clock, once for the whole farm, on the farm's day. Not done, the Manager
is told, then the Owner.

**Blocked by:** —

- [ ] **Standard Playbook** `stockCount`: `triggers: [{ kind: "schedule", times: ["09:00"], weekdays: [5] }]`, whole
      farm, `checkerRole` per decision 3. Fix the wrong comment at `:541`.
- [ ] **Domain:** add `"stock_count"` to `FARM_WORK_EFFECTS` (`sop.ts:804`); the effect reads only `instance.farmId`.
- [ ] **A missed count** is told by `instance_overdue` (24 h grace), then `instance_escalated`. The Owner's home also
      shows "Store last counted: date", red after 8 days — covers a count retired or never adopted.
- [ ] **Catch-up:** a farm adopting the new Version gets next Friday's count, never the missed weeks.
- [ ] **Tests:** raised once a week however many Pens are full; not on a farm with no animals; overdue then escalated;
      the domain accepts a whole-farm `stock_count` and still refuses other effects. **Prove by switching off** the
      whole-farm raising (it would be raised once per Pen).
- [ ] **Somebody opens it:** the Manager's Today on a Friday, the Owner's home when late. Both languages.
