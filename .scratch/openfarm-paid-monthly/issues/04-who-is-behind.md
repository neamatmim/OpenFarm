# 04 — Who is behind

**What to build:** The Venture page says, each month, who has paid this month's sum and who is behind and by how much;
the Owner (not the Investor's other partners) is told when someone is late past the days she set.

**Blocked by:** 03

**Status:** done (2026-10-02)

- [x] **Venture page, Investors tab:** per Agreement — months paid, behind by ৳…, next due. Owner only.
- [x] **A notice to the Owner** when a sum is late past her days, once per month per Agreement (FILLINGS in
      domain/notice-words.ts). No message to the Investor from the app (the farm reminds, as with Baki).
- [x] **The Advance prompt:** when the Running Budget will not cover the month's Reimbursement because sums are
      missing, the Venture says so beside "give your own money".
- [x] **Tests:** behind and paid-up figures across a month boundary; one notice, not one a day.

**As built:** `sumsStandingOf` gained `sumsPaid`, `sums` and `lastMissedOn`. `ventures.agreements` carries each
paper's `sums` standing once a monthly Venture is running; the Investors tab's paid cell says "2 of 4 months paid ·
৳7,500 missed / due / next ৳… on …", missed in the warning colour. `monthly-sums-store.ts`: `standingsOf` (one read for
all papers), `missedByEach` (the list's `sumsMissedBdt`), `missedToTell` / `raiseMissedSums` for the evening sweep.
Notice kind `monthly_sum_missed`: digest, Owner only, about `agreementId|dueOn` of the latest missed month, so each
month is told once; links to the Investors tab. When running money is low and sums are missed, the card and page say
the Advance can feed them until the money comes. Proved by switching off: the eighth-day boundary, and Owner-only (the
first switch-off was green because the test farm had no Manager — one is made in beforeAll now). Told-once rests on the
alert table's unique index, as the Baki notice's does. Not seen in a browser: the seed farm has no running monthly
Venture, so the tab's line, the notice and the Advance line were checked by tests only.
