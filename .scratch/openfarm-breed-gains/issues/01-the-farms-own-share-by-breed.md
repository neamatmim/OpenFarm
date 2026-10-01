# 01 — The farm's own gain share by Breed

**What to build:** On the Breeds page, beside each Breed with five or more measured bulls, what the farm's own bulls of
it put on as a share of what their Rations should give them: the middle one and the middle half, and how many bulls.
"৭টি জার্সি ক্রস ষাঁড়: রেশনের হিসাবের ৮৪% (মাঝের অর্ধেক ৭৬–৯২%)".

**Blocked by:** —

**Status:** not started. Build after the real farm's first 30 days (README, decision 4).

- [ ] **Glossary:** widen **Expected Gain**'s last sentences ("Beside a Ration's Expected Gain stands what the farm's
      own Animals put on…") to say the farm's own are also read by Breed, as a share. Grep first.
- [ ] **Domain** (`expected-gain.ts`): a pure function from each bull's longest measured stay per Ration and that
      Ration's Expected Gain **as written** (not cut for deshi — the point is to measure the Breed) to one share per
      bull, then `farmGainFigureOf` over the shares. One share per bull: his longest measured stay, as
      `farmGainsByRation` counts each animal once per Ration — here once overall. Reuse `gainShareOf`.
- [ ] **Bulls only.** A cow or heifer's gain carries the female effect too; mixing her in would measure the female
      share, not the Breed. Say so beside the figure. (Revisit if the farm fattens heifers in numbers.)
- [ ] **Store:** read the stays as `farmGainsByRation` does — share its spell and stay reading rather than copying it
      (`twins-in-two-modules`). Only Rations with an Expected Gain count.
- [ ] **API:** `breeds.list` carries `farmShare: { animals, medianPercent, lowPercent, highPercent } | null` for the
      Owner and the Manager; nothing for the other Roles.
- [ ] **Web:** the Breeds page shows it under the Breed's name, or nothing while under five. Phone width too.
- [ ] **Tests:** five bulls of a Breed on two Rations give one pooled figure; four give none; a bull's stay before he
      settled in, or on a Ration with no Expected Gain, is not counted; a deshi bull's share is against the uncut
      range; a heifer is left out; a doubted reading is passed over.
- [ ] **Somebody opens it:** the Breeds page on the seed farm (03 gives the seed's bulls their Breeds).
