# 02 — What the last buys cost

**What to build:** The intake sheet shows, beside this animal's ৳/kg, what the farm's own buys of the same weight band
cost over the last 60 days, and by how much this one differs.

**Blocked by:** —

- [ ] **Rule:** weighted ৳/kg (price + Hasil over kg) per weight band, in domain, the `perKgOfSales` shape.
- [ ] **Read:** `intake.recentBuys` (Owner and Manager).
- [ ] **Screen:** a line under the ৳/kg: "গত ৬০ দিনে এই ওজনে গড় ৳…/কেজি — এটা ৳… বেশি".
- [ ] **Tests:** weighted, banded, window; none → nothing said.
