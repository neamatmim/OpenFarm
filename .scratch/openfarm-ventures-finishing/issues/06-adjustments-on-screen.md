# 06 — Adjustments on screen

**What to build:** A month later something arrives — a Sale put right, a vet's bill that was in a pocket. The Owner raises a **Settlement Adjustment** against the settled Venture, saying what turned up, and reads what it does to the figures: what the run would come to now, and what one Unit gained or lost by it.

Small ones, and anything that leaves the Investors worse off, are written down and closed where they stand — nothing is chased. One above the figure she set waits until she either sends the supplementary payout or waives it in words she stands behind. The Settlement's own figures never move through any of it, and the screen has to make that obvious rather than leaving her to wonder which number she is looking at.

She can also turn the figure that decides which is which.

**Blocked by:** 05 (approving, paying out and acknowledging)

**Status:** done

- [x] A settled Venture shows its Adjustments, what each was about, and what became of it
- [x] Raising one shows what the figures would be now beside what was frozen, so the two are never confused
- [x] One that is outstanding can be paid or waived from the screen, and a waiver asks for the reason
- [x] The supplementary payout shows what each Investor got, not only what the act came to
- [x] The figure above which an Adjustment must be dealt with is on the farm's parameters, where the Owner can turn it
- [x] An Adjustment that earlier ones have already paid out says so rather than offering to send it again

## What was decided while building

**The screen and the farm now do one arithmetic, not two.** Each Adjustment says what the figures would be against what was *frozen*, so it carries the ones before it as well as its own — and the screen has to subtract what has already gone out to know what one still owes. The first version worked that out by walking the rows in the order they were **raised**; the farm works it out by subtracting every paid one, in whatever order they were dealt with. Pay a later Adjustment while an earlier one is still open and the two disagreed: the screen offered **Send it** for money the farm then refused. Both reviews found it. The walk now matches, and the duplicate helper is gone — `payAdjustment` reads the same figure the screen shows.

**What each Investor got is derived from when each Adjustment was paid, not when it was raised.** The same assumption made the per-Investor figures wrong out of order — a man shown a number he never got, and a negative taka against a payment. The arithmetic was checked against the farm's own before the code was trusted.

**The pay sheet was telling her a lie.** It opened saying "Sending *What has landed since* ৳0, by bank" over a real bank transfer, on a screen whose whole point is that figures are never confused. It now carries the real amount and names who it is going to.

**It says whose money it is.** A supplementary payout is the Farm making good on the Farm's own books — the Venture Account closed when the Settlement was paid out — and nothing on screen had said so.

**`CACHE_KEY` bumped again.** Two fields were added after the last bump, and neither read site defaulted: a fortnight-old cached answer would have drawn ৳NaN against each Investor and offered to send money an earlier Adjustment had already sent.

## Judgement calls left as they are

**Raising still writes immediately; there is no preview.** The ticket says "raising one shows what the figures would be now beside what was frozen", and both figures do appear — labelled apart — on the row it creates. A review agreed that satisfies the criterion's purpose, while noting she commits blind. A preview would want its own endpoint.

**Still unseen.** As with 04 and 05, nobody has looked at this rendered.
