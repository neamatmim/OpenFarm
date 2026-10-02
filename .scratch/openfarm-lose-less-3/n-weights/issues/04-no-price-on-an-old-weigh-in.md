# 04 — No price on an old Weigh-in

**What to build:** An Internal Sale and the Wind-up Period's buy-back refuse an animal whose last Weigh-in is older than
the Owner's days, naming her and how old it is; the buy-back sheet says each animal's weighing day and names the stale
ones before the Owner commits.

**Blocked by:** —

**Status:** done (2026-10-03).

**As built:** `weighedTooLongAgo` in `domain/priced-weighing.ts`; `assertWeighedLately` in the Venture router, judged
on the act's own day (`soldOn`, `boughtOn`). `whatIsLeft` returns `weighedAt` and `priceWeighInDays`. Both sheets judge
on the day typed (today until one is) and keep the act pressable, saying why when pressed (`missing`). The existing
buy-back test now weighs ten days before it buys. **The seed differs from the draft:** no seed Venture is past its
Wind-up, so the check is shown on the Internal Sale picker instead — F-0045 stops going up the crush after his first
round and is named there as weighed too long ago.

- [x] **Glossary:** **Internal Sale** and **Wind-up Period** widened (her latest Weigh-in must be within the farm's days;
      an older one is named and refused, as an unweighed animal is).
- [x] **Schema:** Farm Parameter `farm.price_weigh_in_days` (default 14, 1–60), **the Owner's alone**, wired as
      `feed_price_jump_percent` was. Migration `…_price_weigh_in_days`, both dev databases.
- [x] **Rule:** `whatSheLastWeighed` (`venture-store.ts:611`) unchanged; a domain `weighedTooLongAgo(weighedAt, day,
    days)` in farm days, one rule for both acts.
- [x] **Entry:** `sellInternally` (`routers/ventures.ts:2139`) refuses `weighed_too_long_ago` (tag, weighed on, days);
      `buyWhatIsLeft` (2973) refuses on the first stale animal with her tag, after the never-weighed check. A word for it
      in `apps/web/src/lib/correction-refusal.ts`.
- [x] **Screen:** `whatIsLeft` returns `weighedAt` beside `weightKg`; the buy-back sheet shows "… · weighed 3 Sept" and
      a "weigh them first" notice for the stale as for the unweighed, with Buy dimmed saying why. The Internal Sale
      picker keeps its weighed day and dims a stale animal saying why. An answer cached without `weighedAt` reads as not
      stale (the server still refuses).
- [x] **Tests:** `routers/internal-sale.test.ts` and `routers/wind-up.test.ts` gain: weighed 20 days before — refused
      with her tag; 10 days — taken; the line is the Owner's. **Proved by switching off** each refusal in turn — red.
- [x] **Somebody opens it** (seed): a Venture past its Wind-up with one bull last weighed a month ago — the buy-back
      sheet names him and his day, and Buy says why it is dim.
