# 05 — What the farm loses in calves

**What to build:** The figure that says whether calf care is working. Over the last twelve months: calves born alive,
stillborn, died before weaning, and the share alive at weaning. Beside it, what they died of and at what age.

**Blocked by:** 03

**Status:** done

- [x] **Domain `calfLosses`** (pure): from calvings, calves, mortalities and weanings. A calf is "lost" if she died
      before her Weaning, or before 90 days where she has none yet. Stillbirths are counted apart. Tests cover a
      calf alive today but not yet weaned, one sold before weaning (not lost), twins, and a death on the day of
      weaning.
- [x] **Causes a farm can count:** the Mortality form offers the common calf causes — scours, pneumonia, navel ill,
      weak at birth, worms — as suggestions, still free text, so the figure can say what they died of. The Mortality
      register gains the animal's age at death.
- [x] **Where the Owner reads it:** a tile on the Owner's home beside the deaths tile, opening to the calves by month.
      The Manager sees it too: it is care, not money.
- [x] **Check first:** `home.ts` declares `MORTALITY_DAYS = 30` but the deaths tile reads `LATE_SINCE_DAYS`. It may
      count the wrong window. A defect only once a test shows it — write that test before touching it.
- [x] **Somebody opens it:** the tile on both homes, and the register's age column, in both languages.

**Built (2026-09-29):**

- Domain `calfLosses` / `lostBeforeWeaning`: over the calves born at a Calving in the stretch — born alive, stillborn
  (apart), lost before weaning (died or culled before her Weaning, or younger than 90 days where she has none), a
  share, and causes, commonest first. A calf sold before weaning is not lost.
- `herd.calfLosses` (Owner and Manager) reads the last 365 days. "Calves in the last 12 months" shows on the
  Manager's home and the Owner's farm page, red above one in ten (DLS).
- The death form offers five calf causes for a calf (`CALF_DEATH_CAUSES`), written in Bangla whoever picks, so the
  figure counts each once.
- The mortality register gains age at death, in days. It is the last column on the paper and in the CSV, so the DLS
  template's columns keep their places. Three pinned tests were updated for it.
- `home.ts` MORTALITY_DAYS: not a live defect. Both windows are 30, so no test can go red. The deaths tile now reads
  the constant named for it instead of the late-work window's.
- Proved by switching off: stillborn calves counted apart (a test red in the domain and in the API).
- A lesson from this ticket: a switch-off written `|| NaN < 1` changes nothing, because it is false. The Baki ticket 03
  told-once proof had used it; it was re-done properly and the conclusion held.
- Opened on the seed farm: the Manager's home says 14 born alive, 1 born dead, none lost.
