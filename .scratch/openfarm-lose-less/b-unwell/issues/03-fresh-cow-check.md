# 03 — The fresh-cow check

**What to build:** A daily look at each cow for her first days after calving.

**Blocked by:** 01

**Status:** done, 2026-09-30.

- [x] **Hung on the Calving, not on reaching Milking** (changed from the plan). Built first on `state: milking`, the
      seed showed why not: every cow already in milk when the farm starts "reached Milking" that day and got five checks
      nobody did (160 missed on the seed). A cow put in Milking on the opening register, or by hand, has not just
      calved. So a new event, `calved` (`CALVED` in `FARM_EVENTS`), read from the Calving table in `recentHappenings`,
      keyed `calved:<id>`, about the dam.
- [x] **Standard Playbook** `afterCalvingCheck` ("বিয়ানোর পর গাভী দেখা" / "The cow after calving"): `calved` at offsets
      0..4 (`DAYS_LOOKED_AT_AFTER_CALVING`, decision 4: five days), dairy, Staff, checked by the Manager, grace a day. One
      per-animal Step: down / afterbirth held / off feed / hard udder, "Well" a skip, the `observation` effect. One
      procedure takes the five Triggers: nothing refuses the same event at several offsets, and each day's work carries
      its own cause. Raised ahead with its due day, as all happening-hung work is.
- [x] **Words:** `down_cow` ("বসে আছে, উঠতে পারছে না") and `afterbirth_retained` ("ফুল পড়েনি (১২ ঘণ্টা পেরিয়ে)") in
      `ROUND_WORDS`, in `URGENT_ROUND_WORDS` (decision 2: an hour's work for the Manager), and in `OBSERVATION_WORDS` so
      they can be reported without a round.
- [x] **Glossary:** **Calving** widened; no "fresh cow" coined.
- [x] **Tests** (`routers/after-calving-check.test.ts`, 3): five checks from a real Calving — at the calving, then the
      start of each of the next four farm days — and no sixth; none for a cow imported already in milk; a cow down raises
      the Manager's hour's work. `standard.test.ts`: both words urgent. **Proved by switching off** the calving happenings
      (2 red) and the two urgent words (1 red).
- [x] **Seed:** the milker answers "Well".
- [ ] **A Correction to the calving time** does not move checks already raised: the cause is the Calving's id, so the
      same work stands at the old days. Left: the checks are a day's grace each, and a calving put right by hours moves
      nothing that matters.
- [x] **Somebody opens it** (reseeded 2026-09-30): the seed now rebuilds cleanly — 75 checks, all from real calvings,
      none missed (69 signed off, 4 finished, 2 ahead). The milker (জাহিদ হাসান) opens "বিয়ানোর পর গাভী দেখা" for
      দোহন পেন ১: D-0012, "গাভীটিকে ভালো করে দেখুন", the four words and "বাদ" to pass her as well.

**Found on the way:** the first build (on reaching Milking) also broke the seed — its Venture Settlement was refused
("an animal still stands"), because the extra work shifted the seed's random choices. Hanging the check on the Calving
removed the extra work and the seed passes again; the seed is still that sensitive to work being added.
