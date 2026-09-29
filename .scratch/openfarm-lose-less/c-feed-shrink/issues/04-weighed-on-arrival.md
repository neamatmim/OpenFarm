# 04 — Weighed on arrival, against the slip

**What to build:** The kilos the scale shows are recorded beside what the slip said. For each seller, the farm sees how
short they run.

**Blocked by:** 03 (so ৳/kg is on the weighed kilos)

- [ ] **Schema:** `feed_in.slip_quantity` (nullable). `quantity` becomes the weighed figure when given, so
      `stockLedger` does not change. Existing rows keep `quantity` as the slip.
- [ ] **API:** `stock.receive` takes an optional `weighed`; bags × `bagSizeKg` becomes the slip figure.
- [ ] **Per seller:** "short on the scale, last 90 days: kg, %, ৳".
- [ ] **Glossary:** widen **Feed Purchase**.
- [ ] **Tests:** weighed wins in the store; no weighing, no difference claimed; bags compared at the fixed bag weight.
- [ ] **Somebody opens it:** the receive form and the seller figures. Both languages.
