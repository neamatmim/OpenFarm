# 02 — The cattle part first

**What to build:** For a Venture paid by the month, capital taken before buying counts to the Cattle Budget only, and
buying cannot start until every signed Agreement has paid its cattle part.

**Blocked by:** 01

**Status:** done (2026-10-02)

- [x] **Budgets:** `heldByEach` divides capital in proportion only for Ventures paid all before buying. Paid by the
      month: what came in before buying is cattle money; what comes in after is running money.
- [x] **`takeCapital` while open:** no more than an Agreement's cattle part (refusal names what is left of it).
- [x] **`startBuying`:** refused while any Agreement's cattle part is short, naming each and what it owes — the button
      stays pressable and says what is missing (the `missing` pattern, 611a06b8). The Floor still applies.
- [x] **Tests:** a refusal per rule, each proved by switching it off; an all-before-buying Venture behaves as today.

**As built:** one rule for what an Agreement may hold by now (`capitalItMayHold`: its Units' Cattle Part while a
monthly Venture is Open, their whole price otherwise) used by `takeCapital`, a Correction of a payment, the Owner's
capital form (`capitalLeftBdt`) and the portal's how-to-pay. Cattle money (`cattleMoneyOf`) is all the capital up to the
signed Units' Cattle Parts, so `budgetsOf` now takes the signed Units. `startBuying` refuses `cattle_money_short`; the
view carries `cattleMoneyShortBdt`, and the button dims with "৳… of the signed Investors' cattle money has still to
come" once the Floor is met. Refusals `capital_over_cattle_part` and `cattle_money_short`; all three rules proved by
switching them off. The dim line itself was not seen on the seed farm (needs a monthly Venture past its Floor with a
part-paid paper).
