# 03 — "Use it", the seed, and somebody opens it

**What to build:** Where a Breed has a figure of the farm's own (01), the Breeds page offers it as the Breed's share
(02) with one press — "Use it" — as the Ration editor offers the farm's own middle half today. The seed's farm grows
bulls of several Breeds at different rates, so the page has something to show.

**Blocked by:** 01, 02

**Status:** not started.

- [ ] **"Use it"** sets the Breed's share to the farm's median, rounded to a whole percent and held inside 02's bounds.
      It writes through `breeds.setGainPercent` — the same check and the same Audit Event as typing it.
- [ ] **Nothing automatic.** The figure is offered, never written in unasked (as a Venture Plan's bands are offered the
      standard figures). No Notice.
- [ ] **Seed:** the seed's bought bulls already carry Breeds (`BULL_BREEDS` in `seed/herd.ts`). Give each Breed its
      own pace in `dailyGainKg` — the crosses near today's, a deshi Breed at about seven tenths — so at least two Breeds
      reach five measured bulls in the seed's three months. Check after `pnpm db:seed --reset` that the figures appear
      and the deshi one comes out near 70%.
- [ ] **Standards page:** one line under the Expected Gain sources saying the farm's own Breed figures replace the
      standard where the farm has set them.
- [ ] **Tests:** "Use it" writes the median and is refused outside the bounds; Barn Staff do not see the figure.
- [ ] **Somebody opens it:** the Breeds page on the seed farm, Bangla and English, phone width; press "Use it" for one
      Breed and see the Fattening board judge its bulls at the new share.
