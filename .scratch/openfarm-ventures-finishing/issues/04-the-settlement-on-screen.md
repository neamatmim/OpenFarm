# 04 — The Settlement on screen: what it comes to, and what blocks it

**What to build:** The Owner opens a Venture that is selling up and reads its close-out before anything is done: what its Animals fetched, every charge as its own line, her **Advance**, capital, the profit, how it splits, and what each Investor would be paid.

And, beside the figures, whatever still makes it a guess — an Animal still standing named by her tag, a price nobody can put on so many kilos of feed, a **Buying Float** not counted home, a month's **Reimbursement** owed, a month the bank has not agreed to. Each in the reader's own language, each saying which thing it is about, so she can go and deal with it rather than being told only "no".

All of this already exists and answers; none of it is drawn anywhere.

**Blocked by:** None — can start immediately.

**Status:** done

- [x] A Venture that is selling shows its Settlement: proceeds, each charge, the Advance, capital, profit, the split and the remainder to the Farm
- [x] Each Investor's line shows his Units, his capital back and what his Units took of the profit
- [x] A loss reads plainly as a loss rather than as a small number
- [x] What blocks it is shown with the figures, each naming what it is about — the tags, the months, the kilos, the taka
- [x] A month that went stale, one that disagreed and one nobody ever read are told apart, because they need three different things done
- [x] A fortnight-old cached answer drawn before any of this existed does not break the screen

## What was decided while building

**The screen says nothing until the farm has answered.** The first version defaulted every figure to zero and every block to none — so while the query was in flight, and for ever if it failed, it drew a green "Nothing is in the way" over a settlement of zeroes. Both reviews caught it; neither compilation nor the test suite could have. It waits on the answer now, and every panel takes a Settlement rather than a maybe-Settlement, which deleted about twenty defaults with it.

**A loss reads as a loss.** It had been a minus sign tucked in after the taka mark — `৳-১২,৩৪৫` — under a label that says "Profit", and an Investor's line read `৳50,000 + ৳-8,000`. Now the label itself changes to Loss, the figure is shown without a sign, the line is marked, and a share that went the wrong way is taken away rather than added.

**"Held" meant two different things one click apart.** The Venture card calls capital-in "Held so far" and the balance "The account should hold"; the sheet had them the other way round and invented a third word. It uses the card's two.

**The bank's three answers say what to do**, not only which months: one wants the statement opened, one wants it read again, one wants explaining.

## A gap worth knowing about

**I could not open the page.** The app requires signing in, which I did not do, and there is no seeded Venture in a settling state to look at. The module compiles and Vite serves it, so nothing is broken structurally — but the layout, the spacing and how several blocks read together have not been seen by anybody. Two reviews read the JSX instead, and between them found four things that only reading it closely would catch. Worth an eye on a real screen before increment 6.
