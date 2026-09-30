# 05 — Days of feed left

**What to build:** Each Feed Item shows how many days the store will last at the rate it has been fed lately.

**Blocked by:** —

**Status:** done, 2026-09-30. Plan C complete.

- [x] **Domain** (`feed.ts`, pure): `fedPerDayOf` — what the Feedings gave over the last `FEED_RATE_DAYS` (14) farm
      days, today among them, or the days since it was first fed for a newer feed; `daysLeftOf` — whole days, none for a
      store at or below nothing, nothing for a feed not fed lately.
- [x] **Running Low widened** (decision 7): under the Manager's level, or fewer days than the farm's line —
      `feed_days_low` (7), the Manager's to set. Told to the Manager in the evening's post as `low_stock`, once until a
      delivery or a count brings the store back up (keyed `:days:` on that moment). A retired feed is never low.
- [x] **UI:** "আর কত দিন" / "Days left" on the stock tab (amber when low) and "N days left at X kg a day" on a phone;
      a feed fed lately counts as watched, no longer "সীমা দেওয়া নেই"; both homes say "… — N days at the rate it is fed"
      for one low by its days (`LowStockWords`); the low tile's hint says so.
- [x] **Glossary:** **Running Low** widened.
- [x] **Tests:** `feed.test.ts` (+3) — a fortnight's rate, a new feed over its own days, a feed not fed, a store below
      nothing; `routers/days-of-feed.test.ts` (5) — 500 kg at 100 a day is 5 days and low; hay nobody feeds says
      nothing; the Manager told once, not the Owner; the Manager's line; a lorry takes it off. **Proved by switching
      off** the days rule, once-per-refill, the farm's line and today counted — each red.
- [x] **Somebody opens it** (seed, 2026-09-30): the stock tab read ৫৯ দিন for গমের ভুসি down to ১১ দিন for নেপিয়ার ঘাস;
      with the seed farm's line put to 12 for a moment, napier went "কমে আসছে" in amber and the Owner's home read
      "নেপিয়ার ঘাস: ১৯,৩৩৪ কেজি আছে — যে হারে খাওয়ানো হচ্ছে তাতে আর ১১ দিন" (and in English); the line was put back to 7.
      The seed's Manager keeps the napier notice from that moment until a reseed.
