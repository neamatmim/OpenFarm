# 02 — Found, or written off as Lost

**What to build:** The Owner writes her off and she leaves as **Lost**: off the boards and head counts, everything
recorded about her kept. (The Manager's Found was built in 01.)

**Blocked by:** 01

**Status:** done, 2026-09-30.

- [x] **Glossary:** **State** and **Exit** widened with Lost; **Missing** says how it becomes Lost and comes back.
      **Mortality** stays died or culled.
- [x] **Schema:** `missing.written_off_at/by`, `lost_cause`, `stolen`, `gd_number`, and `state_before` /
      `state_changed_before` (what she comes back as); `missing_open_uidx` widened. Farm `missing_write_off_days` (7),
      the Owner's alone. Migration `20260930093554_lost_animal`, applied to both dev databases.
- [x] **Domain:** `lost` in `STATES`/`EXIT_STATES` and `ANIMAL_STATES`; `exitOf` carries it. The Holding: `lost` in
      `WhatHappened`, `Left.how "lost"` with nothing back, as a death; the Books read it from written-off Missings
      (`lostSince`); Seasons and breakdown lines count `lost` beside `died`.
- [x] **Write-off** `animals.writeOff` (Owner): only on an open Missing (`not_missing`), stolen needs its GD number
      (`gd_number_needed`), a Venture's animal refused (`venture_owns_her`) until A-04; `leaves()` with `lost` from the
      morning she was last looked for. The Owner is asked on the missing queue once she is past the days.
- [x] **Check first:** the `death` happening was raised for every exit — **a Sale raised Carcass disposal** (test red
      first, fixed 069916ec). Lost raises none; proved by switching the fix off.
- [x] **Corrections:** not `correctHowSheLeft` (it keeps her among the exit States). Found after write-off is the
      Owner's `animals.found`, which brings her back in the State she left from (`comesBack`); the Manager is refused.
      The work her leaving called off stays called off.
- [x] **Home:** "Lost in 12 months: N · ৳ of what they cost" (purchase + everything charged) under the deaths line.
- [x] **Tests:** `routers/lost-animal.test.ts` (6), `cattle-returns.test.ts` (+1). Proved by switching off the Venture
      guard, the Owner's Found, the coming back, the GD number and the no-burial fix — each one red.
- [x] **Somebody opens it** (seed, 2026-09-30): D-0056 made missing nine days in the seed's database — the Owner's
      queue read "Missing 9 days — write it off as lost?"; the dialog asked the GD number once Stolen was ticked; her
      page went Lost with "Written off as lost on 30 September 2026 · … · Stolen · GD …"; the herd panel read
      "১২ মাসে হারিয়ে গেছে: ১টি · খরচ হয়েছিল ৳১০,১৭১"; Found after all put her back in Fattening. The parameter group
      reads in Bangla under Settings.

**Left alone:** her Expected Calving, cleared when she left, does not come back with her — the Vet's next check sets it.
