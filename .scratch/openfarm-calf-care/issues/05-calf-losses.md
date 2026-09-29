# 05 — What the farm loses in calves

**What to build:** The figure that says whether calf care is working. Over the last twelve months: calves born alive,
stillborn, died before weaning, and the share alive at weaning. Beside it, what they died of and at what age.

**Blocked by:** 03

**Status:** not started

- [ ] **Domain `calfLosses`** (pure): from calvings, calves, mortalities and weanings. A calf is "lost" if she died
      before her Weaning, or before 90 days where she has none yet. Stillbirths are counted apart. Tests cover a
      calf alive today but not yet weaned, one sold before weaning (not lost), twins, and a death on the day of
      weaning.
- [ ] **Causes a farm can count:** the Mortality form offers the common calf causes — scours, pneumonia, navel ill,
      weak at birth, worms — as suggestions, still free text, so the figure can say what they died of. The Mortality
      register gains the animal's age at death.
- [ ] **Where the Owner reads it:** a tile on the Owner's home beside the deaths tile, opening to the calves by month.
      The Manager sees it too: it is care, not money.
- [ ] **Check first:** `home.ts` declares `MORTALITY_DAYS = 30` but the deaths tile reads `LATE_SINCE_DAYS`. It may
      count the wrong window. A defect only once a test shows it — write that test before touching it.
- [ ] **Somebody opens it:** the tile on both homes, and the register's age column, in both languages.
