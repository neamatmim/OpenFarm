# 02 — Found, or written off as Lost

**What to build:** The Owner writes her off and she leaves as **Lost**: off the boards and head counts, everything
recorded about her kept. (The Manager's Found was built in 01.)

**Blocked by:** 01

- [ ] **Glossary:** widen **State** (CONTEXT.md:93) and **Exit** (:49) with Lost. **Mortality** stays died or culled.
- [ ] **Schema:** `missing.written_off_at/by`, cause, GD number; widen `missing_open_uidx` to
      `found_at is null and written_off_at is null`.
- [ ] **Domain:** `lost` in `STATES`/`EXIT_STATES` (`lifecycle.ts:17-25`) and `herd.ts:17-28`; `exitOf`
      (`pen-history.ts:152`) shows it on every paper.
- [ ] **Write-off:** the Owner's alone, only on an open Missing, via `leaves()` with `lost` as `recordMortality` does
      (`mortality-store.ts:103`). Asked after `missingWriteOffDays` (D4). GD number per D5.
- [ ] **Check first:** `instances-store.ts:564-576` raises a `death` happening for _any_ exit State, which raises Carcass
      disposal (`standard-playbook.ts:493`). Test first: Lost raises no burial. Check Sold the same way — a
      defect read from code, a hypothesis until a test goes red.
- [ ] **Corrections:** found after write-off is the Owner's Correction back via `correctHowSheLeft`
      (`mortality-store.ts:170`).
- [ ] **Home:** "Lost in 12 months", count and taka at her cost, beside the deaths tile (`home.ts:292-296,443`).
- [ ] **Somebody opens it:** Found, the write-off, her page, the register's Exit column. Both languages.
