# 03 — ৳ per kg on each Feed Purchase

**What to build:** Each Feed Purchase shows its price per unit beside the last one. The Owner is told when it jumps.

**Blocked by:** —

- [ ] **Domain** `unitPriceOf(purchase)`, `priceJump(previous, next, percent)` (pure); previous per decision 5.
- [ ] **Farm Parameter** `feedPriceJumpPercent` (default 10).
- [ ] **Notice** `feed_price_jump`, digest, Owner, once per `feed_in`.
- [ ] **UI:** the receive form shows the last ৳/kg before saving; the purchase list gets ৳/kg and the change.
- [ ] **Glossary:** widen **Feed Purchase**.
- [ ] **Tests:** a harvest (no price) is never compared; a bag purchase compared per kg; a Correction re-reads it.
- [ ] **Somebody opens it:** the receive form and the digest. Both languages.
