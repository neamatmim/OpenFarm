# 03 — Still going, at today's price

**What to build:** A Season or Venture still going shows its Return on Cost at today's price, low–high, the part sold and the part standing apart, labelled «আজকের দামে» and «অনুমান, ফল নয়», with no rate a year. The figures also show above the Fattening board and on the Venture page.

**Blocked by:** 01

**Status:** ready

**Note from 01 (2026-09-27):** the page has no tab bar yet; if 02 has not built it, this ticket does, with 01's content as the Fattening tab.

**Spec:** user stories 14–18. See "The arithmetic" (`runningRangeOf`) and "Reading it" (the strips).

- [ ] **`runningRangeOf`** in the domain, tested: perYear is always null, low ≤ high.
- [ ] **Standing animals** valued as `fattening.prices` values them (latest weight × the farm's market price, or the Venture Plan's), never a third valuation.
- [ ] **Gaps:** an animal with no price a kilo or no weight is left out whole, cost and value, and named with what puts her right. Test that leaving her out does not lower the figure.
- [ ] **No Return on Capital** for a Venture not Settled.
- [ ] **`returns.runningSeasons()`** and **`returns.venture({ ventureId })`**, Owner-only.
- [ ] **The page's Fattening tab** lists running Seasons and Ventures after the finished ones; the missing-prices strip at the top of the page starts here.
- [ ] **A strip above the Fattening board** (Owner only, as the animal prices) and **a panel on the Venture page** (finished or running), each linking to `/returns`.
- [ ] **Old cached answers:** the new Venture field defaults to null.
- [ ] **Somebody opens it:** the board as the Owner and as the Manager (no strip), a running and a settled Venture page, `/returns`.
