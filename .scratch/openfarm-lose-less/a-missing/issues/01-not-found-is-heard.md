# 01 — "Not found" is heard

**What to build:** When the round skips an animal as "Animal not found", a Missing opens against her and the Owner and
Manager are told (D3). Her page and both homes list her until she is found.

**Blocked by:** —

**Status:** done, 2026-09-29. The Manager's **Found** moved here from 02: a Missing nobody could close would sit on both
homes for ever. 02 is now only the write-off and the Lost Exit.

- [x] **Glossary:** **Missing** added before Mortality; _Avoid_ Lost (written off, not looked for), stolen, strayed.
- [x] **Schema:** `missing` (animal, pen looked in, opened-by completion, since, recorded at, found at/by). One open per
      animal (partial unique index on `found_at is null`). No written-off columns yet — 02 adds them and widens the
      index.
- [x] **A skip reason that means something:** `SkipReason.means?: "not_found"` (`SKIP_MEANINGS`, `meaningOfSkip`),
      validated in `sop-content.ts`. `EffectInput.skippedAs` is worked out once in `effectOfStep` from the Step's own
      reasons (matched on the Bangla a phone sends) — B-02 reuses it.
- [x] **Effect:** `observation`, skipped as `not_found`, opens the Missing or leaves the open one alone.
- [x] **Corrections:** anything else the Step now says takes back a Missing it opened and nobody has found yet.
- [x] **Notice:** `animal_missing`, immediate (push, no SMS, not at night), Owner + Manager, urgent in the app's list.
      Raised by the sweep (`tellAboutMissing`, beside withdrawals) and pushed there — an alert raised inside an effect
      is never pushed (`expired_dose_given` has the same gap, left alone).
- [x] **Homes:** "Not found" first on the Manager's queue and the Owner's Needs you; only animals still on the farm.
- [x] **Her page:** a danger notice with the Pen and the day, and "Mark found" for the Owner and the Manager
      (`animals.found`, refused `not_missing` when nothing is open).
- [x] **Editor:** `toBilingualList` keeps a kept reason's English and meaning; it used to drop the English of every
      reason on any edit.
- [x] **Tests:** `routers/missing-animal.test.ts` (11): opened once over two mornings; both homes and her page; "Well"
      opens nothing; a round with the same words but no meaning opens nothing; a Correction takes it back; left the farm
      → not listed; told once to Owner and Manager, not Staff, pushed once; Found closes and a later morning opens a new
      one; Found refused when not missing; Staff may not. **Proved by switching off** opening (6 red), taking back (1
      red) and the on-the-farm filter (1 red).
- [x] **Somebody opens it** (seed, 2026-09-29): published the seed's round with the meaning, not-found D-0056 — the
      Manager home's first tab "পাওয়া যাচ্ছে না", her page's notice and "পাওয়া গেছে" in Bangla and English, the
      Today alerts banner leading with it, Mark found clears it with a toast; D-0003 on the Owner's Needs you.
      English words made neutral after seeing a bull told "Walk the farm for her" / "She is found".

**For the Owner:** a farm's round only hears "not found" from a Version published after this — the standard one has
the meaning; a round adopted before needs its next Version (production starts fresh, so it adopts the new one).
