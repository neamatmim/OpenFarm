# 04 — Writing Baki off

**What to build:** The Owner writes off a Baki that will not be paid, with a reason. What the animal fetched is then
her price less it, everywhere a figure asks, and so is what a litre fetched for a Dispatch. The buyer carries the
mark on every sheet after. A buyer who pays after all puts the write-off back.

**Blocked by:** 02

**Status:** not started

- [ ] **Schema:** `baki_write_off` (id, farm, source sale | dispatch, source id, amount, reason, on, by). Owner only,
      personal session, audited. Refused above what is still owing. A Correction of a write-off is the Owner's, with a
      reason.
- [ ] **Domain `baki.ts`:** a payment beyond everything open goes to written-off Baki, oldest first, and shrinks its
      write-off. Test it.
- [ ] **What she fetched:** one helper, `fetchedBdt(sale) = price − written off`, read by every sum that now reads
      `sale.priceBdt` as what came back:
  - `holding.ts` (`backBdt`), so Return on Cost and Seasons read it
  - `cost-store.ts` (Margin, Costs)
  - `returns-store.ts`
  - `dairy-returns.ts` (a culled cow sold on Baki)

  Grep `priceBdt` near `sale` for any others. Add a test that Margin and Return on Cost agree on a written-off
  animal, since the same rule spelled in two modules is how one of them gets missed.

- [ ] **What a litre fetched:** `dairy-returns.ts` and `cull-store.ts` read a Dispatch's money less what was written
      off, so the Cull list and dairy Return on Cost see the milk that was never paid for.
- [ ] **Ventures:** none of this can touch one (01 refuses a Venture's Baki). Add a test that a Venture's figures are
      unchanged by any write-off on the farm.
- [ ] **The buyer's mark:** `baki.ofBuyer` returns written-off total and when. The sheets say "৳… written off on …".
      The Baki tab lists written-off Baki apart from what is open.
- [ ] **Prove the guards by switching them off:** Owner-only, and the fetched helper in Margin.
- [ ] **Somebody opens it:** a write-off from the Baki tab, the animal's Margin before and after, Returns, the Sale
      sheet's mark for that buyer, in both languages.
