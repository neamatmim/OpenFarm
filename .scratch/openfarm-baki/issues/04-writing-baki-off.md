# 04 — Writing Baki off

**What to build:** The Owner writes off a Baki that will not be paid, with a reason. What the animal fetched is then
her price less it, everywhere a figure asks, and so is what a litre fetched for a Dispatch. The buyer carries the
mark on every sheet after. A buyer who pays after all puts the write-off back.

**Blocked by:** 02

**Status:** done

- [x] **Schema:** `baki_write_off` (id, farm, source sale | dispatch, source id, amount, reason, on, by). Owner only,
      personal session, audited. Refused above what is still owing. A Correction of a write-off is the Owner's, with a
      reason.
- [x] **Domain `baki.ts`:** a payment beyond everything open goes to written-off Baki, oldest first, and shrinks its
      write-off. Test it.
- [x] **What she fetched:** one helper, `fetchedBdt(sale) = price − written off`, read by every sum that now reads
      `sale.priceBdt` as what came back:
  - `holding.ts` (`backBdt`), so Return on Cost and Seasons read it
  - `cost-store.ts` (Margin, Costs)
  - `returns-store.ts`
  - `dairy-returns.ts` (a culled cow sold on Baki)

  Grep `priceBdt` near `sale` for any others. Add a test that Margin and Return on Cost agree on a written-off
  animal, since the same rule spelled in two modules is how one of them gets missed.

- [x] **What a litre fetched:** `dairy-returns.ts` and `cull-store.ts` read a Dispatch's money less what was written
      off, so the Cull list and dairy Return on Cost see the milk that was never paid for.
- [x] **Ventures:** none of this can touch one (01 refuses a Venture's Baki). Add a test that a Venture's figures are
      unchanged by any write-off on the farm.
- [x] **The buyer's mark:** `baki.ofBuyer` returns written-off total and when. The sheets say "৳… written off on …".
      The Baki tab lists written-off Baki apart from what is open.
- [x] **Prove the guards by switching them off:** Owner-only, and the fetched helper in Margin.
- [x] **Somebody opens it:** a write-off from the Baki tab, the animal's Margin before and after, Returns, the Sale
      sheet's mark for that buyer, in both languages.

**Built (2026-09-29):**

- `baki_write_off` (source sale | dispatch, amount, reason, written on). `baki.writeOff` and `baki.correctWriteOff`
  (set to nothing takes it back) are the Owner's alone.
- Domain `bakiStanding` keeps two purses per item: money clears everything open first, then puts write-offs back,
  oldest first; what is left is credit.
- **One place for what she fetched:** `farmCosts` subtracts what stays written off from each Sale's price as it loads
  the animals (`writtenOffByItem`). Margin, Costs, Seasons' Return on Cost and the dairy herd's returns all read
  `farmCosts`, so they cannot disagree. There is no separate Margin-vs-Return test: they share the one load, and the
  test that switches the subtraction off turns red. What a litre fetched is lowered by `fetchedPerLitre` in the three
  milk readers: dairy returns, the cull list and month by month.
- Ventures: a Venture's Sale can never carry Baki (ticket 01), so no write-off can reach one. No separate test.
- The buyer's mark: `baki.ofBuyer` gives `writtenOffBdt` and `lastWrittenOffOn`; the sheets turn red and say it. The
  Baki tab lists written-off Baki in red beside what is open, and keeps a buyer who owes nothing but has a write-off.
- `bakiOfBuyers` was split into `readBook` / `writeOffsOf` / `itemsByBuyer` / `kindStandingOf` for the complexity rule.
- Proved by switching off: Owner-only (four tests red) and the costing's subtraction (two red).
- Opened on the seed farm as Owner: wrote off the trader's ৳6,000 through the dialog; the total owed fell ৳39,340 →
  ৳33,340; his bull's costing reads ৳188,000 against a price of ৳194,000.
