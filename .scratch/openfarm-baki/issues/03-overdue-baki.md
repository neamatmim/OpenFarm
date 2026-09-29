# 03 — Overdue Baki

**What to build:** Baki past its promised day, or a Dispatch's past the farm's days when nobody promised, is named on
the Owner's home and the Manager's queue with the buyer's phone. It is told once in the Digest when it first goes
overdue. Nothing goes to the buyer, and nothing is a push or an SMS.

**Blocked by:** 02

**Status:** not started

- [ ] **`farm.baki_days`**: 30 by default, 7–120, the Owner's, on the Parameters page with the money settings. It
      applies only to a Baki with no promised day.
- [ ] **Domain:** overdue from the day after the promise (the promised day itself is not late) or from `baki_days`
      after it left, by the farm's day. Tests: the promised day itself, the day after, a no-promise Dispatch at
      exactly `baki_days`, a part-paid Baki still overdue, a fully paid one not.
- [ ] **Homes:** `home.owner` needsYou gains `bakiOverdue` (buyers, total, oldest). `home.manager` queue gains a row
      per overdue buyer: what, since when, his phone. Tapping opens his Baki.
- [ ] **Digest:** each Baki named once, the day it first goes overdue, remembered as told the way Running Low is.
      It is not an Alert: it waits for the Digest.
- [ ] **Sheets:** the warning from 02 says "overdue since …" when he is. A new Baki recorded to an overdue buyer is
      named on the Owner's needsYou ("Sold on Baki to a buyer already overdue"). It is never refused.
- [ ] **Prove the guards by switching them off:** the promised-day-is-not-late rule, and told-once.
- [ ] **Somebody opens it:** both homes, the Digest in the app's notice list, the Parameters page, in both languages.
