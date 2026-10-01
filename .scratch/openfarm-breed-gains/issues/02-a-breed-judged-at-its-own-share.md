# 02 — A Breed judged at its own share

**What to build:** A Breed may carry its own share of a Ration's Expected Gain, set by the Owner or the Manager on the
Breeds page. An animal of it is judged against that share instead of the deshi share; one of a Breed with no share of
its own is judged as today.

**Blocked by:** —

**Status:** not started. Build after the real farm's first 30 days (README, decision 4).

- [ ] **Glossary:** widen **Breed** ("A Breed is deshi … or it is not") with: a Breed may carry its own share, which
      replaces the deshi share for it. Grep first.
- [ ] **Schema:** `breed.gain_percent` integer, null by default — null means "as today". A migration, additive; move
      `LATEST_MIGRATION` and migrate the dev databases on merge (`migrate-dev-db-on-merge`).
- [ ] **Bounds — to confirm with the Owner when this is picked up:** 30–120. The deshi and female shares stop at 100
      ("never above what the Ration is written for"), but a Breed's own figure may come out above it — NRC's arithmetic
      gives a Brahman cross about a fifth more — and a farm whose Brahman crosses beat the Ration should be able to say
      so. 120 rather than more: past that the Ration's figures are wrong, and the answer is to edit the Ration.
- [ ] **Domain:** `expectedGainFor` takes the Breed's own share: it replaces `deshiPercent` when set; the female share
      still multiplies. `GainAdjustment` says which applied (`breedPercent`), so the board can say "judged at 85% —
      Jersey cross's own".
- [ ] **Everywhere the range is cut:** `againstExpectedGains`, `suggestedTargetOf` / `grownWeightFor`, and the
      penmates comparison (`gainShareOf` against her own cut range). Grep `expectedGainFor(` and `deshiGainPercent`
      — every reader of the deshi share must read the Breed's first.
- [ ] **API:** `breeds.setGainPercent({ id, percent | null })`, Owner and Manager, audited with before and after.
      Retired Breeds keep theirs.
- [ ] **Web:** on the Breeds page, beside "deshi": "Judged at __% of the Ration's Expected Gain" with a clear button
      back to "as the farm's deshi share" / "as written". The board and the slow-gainers list say the share used.
- [ ] **Tests:** a Jersey cross at 85% is judged under where he was within at 100%; a deshi Breed with its own 90% is
      judged at 90, not 70 × 90; a heifer of it at 90 × 80; cleared, back to the deshi share; Barn Staff refused;
      the suggested target at Intake moves with it.
- [ ] **Somebody opens it:** set a share on the seed farm, open the Fattening board and an animal's page.
