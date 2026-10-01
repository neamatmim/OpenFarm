# 03 — Monthly sums while it runs

**What to build:** A Venture paid by the month takes each Agreement's monthly sums by bank while it is buying or
fattening (and selling, if the Owner decides so), into its Running Budget, never more than the Agreement signed for.

**Blocked by:** 02

**Status:** done (2026-10-02)

- [x] **`takeCapital`** allows the running states for these Ventures only; refused over what is still owed, after the
      last month's sum is in, and for a Venture paid all before buying (as today).
- [x] **Running Budget** grows by what arrives, so a month's Reimbursement can be paid from it; the Advance still
      covers a month nothing came in for.
- [x] **Corrections** of a monthly sum, as of any capital movement (`corrections/venture-movement.ts`).
- [x] **Portal "how to pay"** shows this month's sum, what is owed altogether and the due day, while anything is owed.
- [x] **Tests:** a sum lands in the Running Budget not the Cattle Budget; the refusals; the Settlement after all months
      paid divides exactly as Units signed.

**As built:** `takesCapital` (domain) says when a Venture takes capital — Open, or paid by the month while buying or
fattening (`TAKES_MONTHLY_SUMS`); `takeCapital`, the portal's how-to-pay and the Investors tab's "take capital" all ask
it. Past Open the cap is the Units' whole price (`capitalItMayHold`), refused as `capital_over_units`. Monthly money
lands on the Running Budget through `cattleMoneyOf`. `sumsStandingOf` works an Agreement's owed / due / missed (from the
18th) / next sum, oldest sum cleared first — the portal shows due now, the rest altogether and the next sum; ticket 04
reuses it. Selling refuses a sum (domain test; the server guard is the same rule, proved switched off). The portal page
itself was not opened in a browser (needs an Investor sign-in); its answer is pinned by how-to-pay.test.ts.
