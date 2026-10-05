# 01 — The farm's own gain share by Breed

**What to build:** On the Breeds page, beside each Breed with five or more measured bulls, what the farm's own bulls of
it put on as a share of what their Rations should give them: the middle one and the middle half, and how many bulls.
"৭টি জার্সি ক্রস ষাঁড়: রেশনের হিসাবের ৮৪% (মাঝের অর্ধেক ৭৬–৯২%)".

**Blocked by:** —

**Status:** done (2026-10-05), built ahead of the 30 days at the Owner's word

- [x] **Glossary:** widen **Expected Gain**'s last sentences ("Beside a Ration's Expected Gain stands what the farm's
      own Animals put on…") to say the farm's own are also read by Breed, as a share. Grep first.
- [x] **Domain** (`expected-gain.ts`): a pure function from each bull's longest measured stay per Ration and that
      Ration's Expected Gain **as written** (not cut for deshi — the point is to measure the Breed) to one share per
      bull, then `farmGainFigureOf` over the shares. One share per bull: his longest measured stay, as
      `farmGainsByRation` counts each animal once per Ration — here once overall. Reuse `gainShareOf`.
- [x] **Bulls only.** A cow or heifer's gain carries the female effect too; mixing her in would measure the female
      share, not the Breed. Say so beside the figure. (Revisit if the farm fattens heifers in numbers.)
- [x] **Store:** read the stays as `farmGainsByRation` does — share its spell and stay reading rather than copying it
      (`twins-in-two-modules`). Only Rations with an Expected Gain count.
- [x] **API:** `breeds.list` carries `farmShare: { animals, medianPercent, lowPercent, highPercent } | null` for the
      Owner and the Manager; nothing for the other Roles.
- [x] **Web:** the Breeds page shows it under the Breed's name, or nothing while under five. Phone width too.
- [x] **Tests:** five bulls of a Breed on two Rations give one pooled figure; four give none; a bull's stay before he
      settled in, or on a Ration with no Expected Gain, is not counted; a deshi bull's share is against the uncut
      range; a heifer is left out; a doubted reading is passed over.
- [x] **Somebody opens it:** the Breeds page on the seed farm (03 gives the seed's bulls their Breeds).

**As built:** domain `bullShareOf` (longest stay, against the middle of the Ration as written) and `breedShareFigureOf` (five
bulls, whole percents); store `farmGainsByBreed` reading `measuredStaysOf`, now shared with `farmGainsByRation`;
`breeds.farmShares` (its own procedure, after review: `breeds.list` also feeds the breed pickers and the seed, which must not pay for a herd-wide scan). Tests: `routers/breed-gains.test.ts` (pooled across two Rations; deshi against the
uncut range; four give none; a heifer and a bull on a Ration with no Expected Gain left out — bulls-only proved red
when switched off) and the domain tests. A doubted reading and the settling-in weeks are the shared stay reading's,
already tested for `farmGainsByRation`, and not tested again here.
