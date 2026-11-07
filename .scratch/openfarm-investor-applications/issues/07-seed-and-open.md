# 07 — Seeded, and opened

**Blocked by:** 06

**Status:** done (2026-11-08)

- [x] Seed one link not used, one waiting Application (person) and one declined, into `openfarm_seed`.
- [x] Apply the migration to OpenFarm and the seed DB, move `LATEST_MIGRATION`, restart the dev server.
- [x] Walk it end to end on the dev farm with the switch on: make a link, apply from it, approve, sign in with the
      texted code (the dev SMS gateway's log). Then turn the switch off again. The Owner turns it on for real.

**As built:** `seed/applications.ts` (`applyByLink`, wired in `seed/farm.ts`). Its steps text through a gateway that
keeps the codes in memory, since the seed sends no texts. The switch is on in the seed: one Application declined six
days ago with the Owner's line, one waiting since two days ago, and a link sent last evening not yet opened.
`openfarm_seed` was reseeded with it (423 s). The walk on the seed farm is in 06's notes. The Owner turns the switch on
for real.
