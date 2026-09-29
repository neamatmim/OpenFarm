# 03 — Overdue Baki

**What to build:** Baki past its promised day, or a Dispatch's past the farm's days when nobody promised, is named on
the Owner's home and the Manager's queue with the buyer's phone. It is told once in the Digest when it first goes
overdue. Nothing goes to the buyer, and nothing is a push or an SMS.

**Blocked by:** 02

**Status:** done

- [x] **`farm.baki_days`**: 30 by default, 7–120, the Owner's, on the Parameters page with the money settings. It
      applies only to a Baki with no promised day.
- [x] **Domain:** overdue from the day after the promise (the promised day itself is not late) or from `baki_days`
      after it left, by the farm's day. Tests: the promised day itself, the day after, a no-promise Dispatch at
      exactly `baki_days`, a part-paid Baki still overdue, a fully paid one not.
- [x] **Homes:** `home.owner` needsYou gains `bakiOverdue` (buyers, total, oldest). `home.manager` queue gains a row
      per overdue buyer: what, since when, his phone. Tapping opens his Baki.
- [x] **Digest:** each Baki named once, the day it first goes overdue, remembered as told the way Running Low is.
      It is not an Alert: it waits for the Digest.
- [x] **Sheets:** the warning from 02 says "overdue since …" when he is. A new Baki recorded to an overdue buyer is
      named on the Owner's needsYou ("Sold on Baki to a buyer already overdue"). It is never refused.
- [x] **Prove the guards by switching them off:** the promised-day-is-not-late rule, and told-once.
- [x] **Somebody opens it:** both homes, the Digest in the app's notice list, the Parameters page, in both languages.

**Built (2026-09-29):**

- Domain `overdueFrom` / `isBakiOverdue` / `soldOnBakiWhileOverdue` (the name `isOverdue` was taken by late work).
  With no promise, overdue from the day after `baki_days` have run from the day it left.
- `farm.baki_days` (30, 7–120) in its own Owner-only "Baki" group on the Parameters page.
- `overdueBaki` feeds `home.manager.queue.bakiOverdue` and `home.owner.needsYou.bakiOverdue` (under the Money tab);
  `baki.ofBuyer` gains `overdueSince`, and the sheets' warning turns red and says so.
- Notice kind `baki_overdue`: digest, Owner and Manager, about the Sale or Dispatch, leading to Money → Baki.
- Proved by switching off: the promised-day-is-not-late rule (three tests red). Told-once is held by the alert
  table's own unique index (one per person per thing per kind): switching off `overdueToTell`'s filter left the test
  green, so that filter only saves an empty transaction on a quiet morning.
- The i18n bare-count check learned that "owes" follows a name.
- Opened on the seed farm: the Manager's queue tab, the Owner's list, the Parameters group and the notice in the
  Today list, in Bangla.
