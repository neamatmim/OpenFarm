# 02 — The cattle part first

**What to build:** For a Venture paid by the month, capital taken before buying counts to the Cattle Budget only, and
buying cannot start until every signed Agreement has paid its cattle part.

**Blocked by:** 01

**Status:** not started

- [ ] **Budgets:** `heldByEach` divides capital in proportion only for Ventures paid all before buying. Paid by the
      month: what came in before buying is cattle money; what comes in after is running money.
- [ ] **`takeCapital` while open:** no more than an Agreement's cattle part (refusal names what is left of it).
- [ ] **`startBuying`:** refused while any Agreement's cattle part is short, naming each and what it owes — the button
      stays pressable and says what is missing (the `missing` pattern, 611a06b8). The Floor still applies.
- [ ] **Tests:** a refusal per rule, each proved by switching it off; an all-before-buying Venture behaves as today.
