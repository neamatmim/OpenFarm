# 07 — Investors read a settled share

**What to build:** An Investor in a settled Venture reads their **Return on Capital** as «প্রতি ১০০ টাকা মূলধনে … টাকা লাভ» over the Venture's own days, under their payout, on the portal's Venture page and on the হিসাব নিকাশ — behind a switch that stays off until the advisers see the wording. Never a rate a year (ADR 0012).

**Blocked by:** 01

**Status:** ready

**Spec:** user stories 38–40. See "Investors".

- [ ] **`farm.investor_returns`** (default false) and **`investors.setReturnsShown`**, Owner-only, audited, as `setProjectionsShown`. Migration applied to both dev databases.
- [ ] **`portal-reads`**: a settled Agreement's `returnOnCapital: { per100, days } | null`, that Investor's own, only with the switch on, always in the Preview.
- [ ] **The হিসাব নিকাশ** prints the share line under the payout while the switch is on; a loss the same way; the standing footer stays.
- [ ] **Tests:**
  - switch off: nothing in the portal answer or the paper;
  - on: the share and days only;
  - the Preview shows it off;
  - **no rate a year anywhere in the portal answer or the paper text** — prove the test by adding one and seeing it go red;
  - a Manager and another Investor cannot read it.
- [ ] **Web:** the portal's settled Venture page; the Owner's switch beside the Projections switch, saying the advisers must see it first.
- [ ] **Old cached answers:** `returnOnCapital` defaults to null.
- [ ] **Somebody opens it:** the portal at phone width as a seeded Investor, the Preview with the switch off, the হিসাব নিকাশ by print preview cloned into an overlay.
