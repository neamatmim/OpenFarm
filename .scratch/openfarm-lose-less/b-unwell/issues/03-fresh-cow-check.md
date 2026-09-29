# 03 — The fresh-cow check

**What to build:** A daily look at each cow for her first days after calving.

**Blocked by:** 01

- [ ] **Standard Playbook:** `freshCowCheck`, `state: milking` at offsets 0..N-1. Check whether `sop.ts` (~864) accepts
      one State at several offsets; if not, one Version per day as `hisDose` does (`standard-playbook.ts:691-702`).
      `appliesTo: { side: "dairy" }`, Staff, checked by the Manager. One choice Step, "Well" a skip, observation effect.
- [ ] **Round words:** `down_cow` ("বসে আছে, উঠতে পারছে না" / "Down, cannot rise") and `afterbirth_retained` ("ফুল
      পড়েনি" / "Afterbirth not passed", after 12 h), in `ROUND_WORDS` (:128) and `OBSERVATION_WORDS`. Ketosis is read
      through `off_feed` and the milk dropping.
- [ ] **Glossary:** widen **Lactation** or **Calving**; coin no "fresh cow".
- [ ] **Tests:** raised for a cow that calved, not for a Dry cow's Move. A Correction to the calving time moves the open
      work.
- [ ] **Somebody opens it:** the milker's Today on the calving day. Both languages.
