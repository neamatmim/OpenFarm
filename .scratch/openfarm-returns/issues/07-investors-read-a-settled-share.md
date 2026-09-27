# 07 — Investors read a settled share

**What to build:** An Investor in a settled Venture reads their **Return on Capital** as «প্রতি ১০০ টাকা মূলধনে … টাকা লাভ» over the Venture's own days, under their payout, on the portal's Venture page and on the হিসাব নিকাশ — behind a switch that stays off until the advisers see the wording. Never a rate a year (ADR 0012).

**Blocked by:** 01

**Status:** done

**Spec:** user stories 38–40. See "Investors".

- [x] **`farm.investor_returns`** (default false) and **`investors.setReturnsShown`**, Owner-only, audited, as `setProjectionsShown`. Migration applied to both dev databases.
- [x] **`portal-reads`**: a settled Agreement's `returnOnCapital: { per100, days } | null`, that Investor's own, only with the switch on, always in the Preview.
- [x] **The হিসাব নিকাশ** prints the share line under the payout while the switch is on; a loss the same way; the standing footer stays.
- [x] **Tests:**
  - switch off: nothing in the portal answer or the paper;
  - on: the share and days only;
  - the Preview shows it off;
  - **no rate a year anywhere in the portal answer or the paper text** — prove the test by adding one and seeing it go red;
  - a Manager and another Investor cannot read it.
- [x] **Web:** the portal's settled Venture page; the Owner's switch beside the Projections switch, saying the advisers must see it first.
- [x] **Old cached answers:** `returnOnCapital` defaults to null.
- [x] **Somebody opens it:** the portal at phone width as a seeded Investor, the Preview with the switch off, the হিসাব নিকাশ by print preview cloned into an overlay.

## Notes from the build

- **Where it is read:** each settled Agreement in `portal.portfolio` carries `returnOnCapital: { per100, days }`, and
  the portal's Venture page reads it from the portfolio it already reads the payout from. The Owner's Portal Preview
  shows it — and the হিসাব নিকাশ's line — whether or not the switch is on.
- **Their days** are from their first capital arriving to their payout: a span they can find on their own papers, not
  the money-weighted average the Owner's rate a year is worked over. With one deposit the two agree.
- **One wording:** the paper's Bangla half is the portal's sentence word for word, and a test holds them together.
- **The ADR** said "under the standing footer"; the spec said under the payout. Built under the payout, the footer
  untouched; ADR 0012's line now says so.
- **The copy** calls it Return on Capital / মূলধনে লাভ, as the glossary does; the column and the procedure keep the
  spec's names (`investor_returns`, `setReturnsShown`). Projections and Return on Capital share one switch component.
- **Checked on the seed:** the switch beside Projections, the Preview with it off, the portal as আবুল হাশেম মিয়া, and
  his হিসাব নিকাশ drawn in an overlay: «প্রতি ১০০ টাকা মূলধনে ১৪.৫ টাকা লাভ, ৭৭ দিনে» under his payout. The seed's
  switch is left off.

## The advisers

- **2026-09-27:** the Owner reports the lawyer and the Shariah scholar approved the wording as built, with no changes.
  Nothing in the code waits any more; the switch under Investors is the Owner's to turn on.
