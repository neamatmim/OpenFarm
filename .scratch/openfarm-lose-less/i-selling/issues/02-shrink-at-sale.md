# 02 — Shrink at sale

**What to build:** The weight she lost between her last weighing and the sale — kg and % — shown on the sale sheet for
every animal, on today's sales and per Selling Trip; the sale weight correctable.

**Blocked by:** —

**Status:** done, 2026-10-01.

- [x] **Glossary:** new **Shrink** ("weight loss" is a sick animal's).
- [x] **Rule:** domain `shrinkOf` (kg, % of her last weight, days between, stale past 21 days; a gain is less than
      nothing) and `shrinkOfMany` (weighed by weight). `shrink-store.ts`: her last Weigh-in before the moment asked, or
      else her Intake's weight.
- [x] **Screen:** the sale sheet's weight hint reads `sale.lastWeighed` for any tag — "শেষ ওজন … কেজি, <day> · আজ … কেজি
      কম (…%)", or heavier "পাল্লাটা দেখে নিন", with the age where stale; today's sales show it under the weight;
      each past Selling Trip shows "বিক্রি হওয়াগুলোর পথে ওজন কমেছে …% (… কেজি)".
- [x] **Correction:** `weightKg` on the sale correction and its dialog; a weight put right also re-asks the
      sold-under-cost notice (the market low reads her weight).
- [x] **Tests:** `routers/shrink.test.ts` (4), domain `shrink.test.ts` (4). **Proved by switching off** the Weigh-ins
      (arrival weight only), the correction's weight and the trip's figure — each red.
- [x] **Somebody opens it** (seed, 2026-10-01): today's sales read "৩০০ কেজি · আজ ৭ কেজি কম (২.৩%)" under F-0019.
      **Not seen:** the sheet's hint — the seed had no animal the picker would offer (all fattening stock inside a
      withdrawal); it is `lastWeighed` (tested) through `shrinkOf` (tested) in the same words the day's sales showed.
